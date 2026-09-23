import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";

// Teardown sweeper for the Thormine mission (ms.thormine.ts, phase 2). A
// [CARRY, CARRY, MOVE] body from the mission room's own spawn that moves every
// bit of energy in the room into the terminal, taking from sources in this
// order and only moving down the list when the tiers above are empty:
//   1. dropped energy
//   2. tombstones and ruins
//   3. storage, containers, links
//   4. towers, once the room's spawn energy is under kTowerBelow (no more
//      cleanups can be built, so the towers can be drained)
//   5. extensions and the spawn
// With no energy anywhere but the terminal it walks to the spawn and is
// recycled (or suicides when the spawn is already gone).

export const kCleanupBody: BodyPartConstant[] = [CARRY, CARRY, MOVE];
export const kCleanupCost = _.sum(kCleanupBody, part => BODYPART_COST[part]);
// Towers become a source once the room's spawn energy is under this.
export const kTowerBelow = 150;
// A spawn trickles energy back 1 a tick; under this much it counts as empty,
// or the last cleanup would stand there withdrawing one energy a tick forever.
export const kSpawnDregs = 50;

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
    const exts = room.findStructs(STRUCTURE_EXTENSION)
        .filter(s => energyIn(s as AnyStoreStructure) > 0) as AnyStoreStructure[];
    const spawns = room.findStructs(STRUCTURE_SPAWN)
        .filter(s => energyIn(s as AnyStoreStructure) >= kSpawnDregs) as AnyStoreStructure[];
    return [...exts, ...spawns];
}

// Energy in the room outside the terminal that a cleanup could still move,
// spawn dregs excluded.
export function looseEnergy(room: Room): number {
    let total = 0;
    for (const r of room.find(FIND_DROPPED_RESOURCES)) total += energyIn(r);
    for (const t of room.find(FIND_TOMBSTONES)) total += energyIn(t);
    for (const r of room.find(FIND_RUINS)) total += energyIn(r);
    for (const s of room.findStructs(STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_LINK,
        STRUCTURE_TOWER, STRUCTURE_EXTENSION)) total += energyIn(s as AnyStoreStructure);
    for (const s of room.findStructs(STRUCTURE_SPAWN)) {
        const e = energyIn(s as AnyStoreStructure);
        if (e >= kSpawnDregs) total += e;
    }
    return total;
}

@register
export class Cleanup extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const roomName = this.mission.roomName;
        const local = spawns.filter(s => s.room.name === roomName && s.room.energyAvailable >= kCleanupCost);
        const spawn = _.sample(local);
        if (!spawn) return [null, []];
        return [spawn, kCleanupBody];
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

    // Nothing left to move: hand the body back at the spawn.
    @task
    recycle(): Task2Ret {
        const spawn = this.pos.findClosestByRange(this.c.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn) {
            this.log("no spawn to recycle at, suiciding");
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
