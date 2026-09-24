import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { energyDef } from "spawn";

// Teardown sweeper for the Thormine mission (ms.thormine.ts, phase 2). A
// CARRY, CARRY, MOVE body repeated as far as the energy available in the
// mission room's own spawn and extensions allows (energyDef, interleaved, up
// to 50 parts; at least 150 energy for the smallest), so the early sweepers
// are big and the last ones, built from what they have not yet drained, are
// small. It moves every bit of energy in the room into the terminal, taking
// from sources in this order and only moving down the list when the tiers
// above are empty:
//   1. dropped energy
//   2. tombstones and ruins
//   3. storage, containers, links
//   4. towers, once the room's spawn energy is under kTowerBelow (no more
//      cleanups can be built, so the towers can be drained)
//   5. extensions. Never the spawn: it makes 1 energy a tick on its own, so
//      counting it would keep the sweep alive for ever; its last 300 go
//      down with it.
// With no energy anywhere but the terminal it hands its body back: recycled
// at the spawn when the refund is worth kRecycleWorth (the refund is dropped
// beside the spawn, so a small one would only seed a pile that calls for one
// more sweeper, for ever), otherwise it suicides on the spot.

// The smallest body laid: one CARRY, CARRY, MOVE group; the spawn gate.
export const kCleanupBody: BodyPartConstant[] = [CARRY, CARRY, MOVE];
export const kCleanupCost = _.sum(kCleanupBody, part => BODYPART_COST[part]);

// As many CARRY, CARRY, MOVE groups as `energy` buys, MOVEs between the
// groups (spawn.ts energyDef interleave), never over 50 parts.
export function cleanupBody(energy: number): BodyPartConstant[] {
    return energyDef({ move: 2, per: [CARRY], energy, interleave: true } as any);
}
// Towers become a source once the room's spawn energy is under this.
export const kTowerBelow = 150;
// Recycle only when the refund (body cost scaled by life left) is at least
// this; a smaller body suicides so its refund pile never restarts the sweep.
export const kRecycleWorth = 300;

type EnergySource = Resource | Tombstone | Ruin | AnyStoreStructure;

function energyIn(s: EnergySource): number {
    if (s instanceof Resource) return s.resourceType === RESOURCE_ENERGY ? s.amount : 0;
    return s.store[RESOURCE_ENERGY] || 0;
}

// Energy sources in `room` by tier; the first tier with anything in it.
export function cleanupTier(room: Room): EnergySource[] {
    const dropped = room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY });
    if (dropped.length) return dropped;
    const dead: (Tombstone | Ruin)[] = [
        ...room.find(FIND_TOMBSTONES, { filter: t => t.store[RESOURCE_ENERGY] > 0 }),
        ...room.find(FIND_RUINS, { filter: r => r.store[RESOURCE_ENERGY] > 0 }),
    ];
    if (dead.length) return dead;
    const stores = room.findStructs(STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_LINK)
        .filter(s => energyIn(s as AnyStoreStructure) > 0) as AnyStoreStructure[];
    if (stores.length) return stores;
    if (room.energyAvailable < kTowerBelow) {
        const towers = room.findStructs(STRUCTURE_TOWER)
            .filter(s => energyIn(s as AnyStoreStructure) > 0) as AnyStoreStructure[];
        if (towers.length) return towers;
    }
    return room.findStructs(STRUCTURE_EXTENSION)
        .filter(s => energyIn(s as AnyStoreStructure) > 0) as AnyStoreStructure[];
}

// Energy in the room outside the terminal that a cleanup could still move;
// the spawn's own store never counts (see cleanupTier).
export function looseEnergy(room: Room): number {
    let total = 0;
    for (const r of room.find(FIND_DROPPED_RESOURCES)) total += energyIn(r);
    for (const t of room.find(FIND_TOMBSTONES)) total += energyIn(t);
    for (const r of room.find(FIND_RUINS)) total += energyIn(r);
    for (const s of room.findStructs(STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_LINK,
        STRUCTURE_TOWER, STRUCTURE_EXTENSION)) total += energyIn(s as AnyStoreStructure);
    return total;
}

@register
export class Cleanup extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const roomName = this.mission.roomName;
        const local = spawns.filter(s => s.room.name === roomName && s.room.energyAvailable >= kCleanupCost);
        const spawn = _.sample(local);
        if (!spawn) return [null, []];
        return [spawn, cleanupBody(spawn.room.energyAvailable)];
    }

    get energy(): number {
        return this.c.store[RESOURCE_ENERGY] || 0;
    }

    get terminal(): StructureTerminal | null {
        return this.mission.room?.terminal || null;
    }

    start(): Task2Ret {
        const roomName = this.mission.roomName;
        if (this.pos.roomName !== roomName) return this.moveRoom(roomName);

        if (this.energy > 0 && !this.c.store.getFreeCapacity()) return this.deliver();

        const source = this.pos.findClosestByRange(cleanupTier(this.c.room));
        if (source) return this.gather(source);

        if (this.energy > 0) return this.deliver();
        return this.recycle();
    }

    @task
    gather(source: EnergySource): Task2Ret {
        if (!this.c.store.getFreeCapacity()) return "start";
        if (energyIn(source) <= 0) return "start";
        if (!this.pos.isNearTo(source)) {
            this.moveTarget(source, 1);
            return "wait";
        }
        const err = source instanceof Resource
            ? this.c.pickup(source)
            : this.c.withdraw(source, RESOURCE_ENERGY);
        if (err !== OK) this.log("gather failed", err, source);
        return "start";
    }

    @task
    deliver(): Task2Ret {
        if (!this.energy) return "start";
        const terminal = this.terminal;
        if (!terminal) {
            this.log("no terminal in", this.mission.roomName);
            return "wait";
        }
        if (!this.pos.isNearTo(terminal)) {
            this.moveTarget(terminal, 1);
            return "wait";
        }
        const err = this.c.transfer(terminal, RESOURCE_ENERGY);
        if (err !== OK) this.log("transfer failed", err, terminal);
        return "start";
    }

    // What recycleCreep would drop: the body cost scaled by life left.
    get refund(): number {
        const cost = _.sum(this.c.body, part => BODYPART_COST[part.type]);
        return Math.floor(cost * (this.c.ticksToLive || 0) / CREEP_LIFE_TIME);
    }

    // Nothing left to move: hand the body back at the spawn, or just die.
    @task
    recycle(): Task2Ret {
        const spawn = this.pos.findClosestByRange(this.c.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn || this.refund < kRecycleWorth) {
            this.dlog("suiciding, refund", this.refund, spawn ? "" : "no spawn");
            this.c.suicide();
            return "wait";
        }
        if (!this.pos.isNearTo(spawn)) {
            this.moveTarget(spawn, 1);
            return "wait";
        }
        const err = spawn.recycleCreep(this.c);
        if (err !== OK) this.log("recycle failed", err, spawn);
        return "wait";
    }
}
