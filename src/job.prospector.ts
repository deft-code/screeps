import { JobCreep } from "job.creep";
import { CreepMove } from "creep.move";
import { register, task, Task2Ret } from "mycreep";
import { fleeKeepers } from "job.skharvester";
import { roomKind, Kind } from "intel";

// Prospector: mines the mission room's ordinary mineral (never thorium) and
// carries it home. Body: kUnits of [WORK, CARRY, MOVE, MOVE] (250 each) up
// to what the home room's energy capacity buys, at most 12 (48 parts),
// laid out WORK first, then CARRY, then every MOVE at the end: damage
// comes off the front, so a hurt prospector loses mining before it loses
// speed, and with 2 MOVE per WORK+CARRY it never slows on plain or road
// even loaded. Spawned in the mission's home room only, with the whole
// cost in hand.
//
// Each tick, in order:
//   keepers  in a Source Keeper room (roomKind) it walks with
//            memory.rewalksk and follows Skharvester's fleeKeepers: a
//            keeper within 5, or a lair within 5 about to spawn one, is
//            fled to 6, and at 6 it holds still.
//   retreat  every WORK part broken (and some hits lost), or an armed
//            non-keeper enemy in the mission room: go home, unload what it
//            carries, and (broken) recycle at a spawn.
//   home     full, or under kHomeTTL to live with a load: carry it home
//            (JobCreep.unloadHome, latched by memory.unload until empty).
//            Empty in the home room under kRecycleTTL to live: recycle at
//            the nearest spawn (suicide without one).
//   mine     walk to the mineral spot (the mission's mineralSpot() when it
//            has one, else beside the mineral) and harvest; an extractor
//            on cooldown (ERR_TIRED) is waited out, no extractor logged.
// SkFarm and Reactor lay one per 1450 ticks (paceNJobs) while wantProspector
// below holds: no armed enemy, a Source Keeper tombstone within 5 of the
// mineral when the room has lairs, home under 50k of the mineral.

export interface ProspectMission {
    // Where to stand while mining, or null for any tile beside the mineral.
    mineralSpot?(): RoomPosition | null
}

const kUnitParts: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE];
const kUnitCost = _.sum(kUnitParts, part => BODYPART_COST[part]);
const kMaxUnits = Math.floor(MAX_CREEP_SIZE / kUnitParts.length);
// Head home with a load under this many ticks to live.
const kHomeTTL = 100;
// Empty at home under this many ticks to live: recycle.
const kRecycleTTL = 200;

// The mission room's ordinary mineral (not thorium), if visible.
export function roomMineral(room: Room | null): Mineral | null {
    if (!room) return null;
    return _.find(room.find(FIND_MINERALS), m => m.mineralType !== (RESOURCE_THORIUM as ResourceConstant)) || null;
}

// What `room` holds of `res` in storage and terminal.
export function roomStock(room: Room, res: ResourceConstant): number {
    return (room.storage?.store[res] || 0) + (room.terminal?.store[res] || 0);
}

// A keeper tombstone this close to the mineral means its keeper is dead.
const kTombRange = 5;
// No prospector while home holds this much of the mineral.
export const kMineralStock = 50000;

// Whether a mission with `room` in sight should keep a prospector on its
// mineral (SkFarm, Reactor): no armed non-keeper enemy in the room, mineral
// left, a Source Keeper tombstone within kTombRange of the mineral when the
// room has lairs (its keeper is dead, so the spot is clear for a while),
// and `home` (if visible) holding under kMineralStock of the mineral.
export function wantProspector(room: Room, home: Room | null): boolean {
    if (_.any(room.hostiles || [], h => !h.keeper)) return false;
    const mineral = roomMineral(room);
    if (!mineral || !mineral.mineralAmount) return false;
    if (room.findStructs(STRUCTURE_KEEPER_LAIR).length) {
        const tomb = _.any(room.find(FIND_TOMBSTONES), t => t.creep.owner.username === "Source Keeper" && t.pos.inRangeTo(mineral, kTombRange));
        if (!tomb) return false;
    }
    if (home && roomStock(home, mineral.mineralType) >= kMineralStock) return false;
    return true;
}

@register
export class Prospector extends JobCreep {
    static body(energy: number): BodyPartConstant[] {
        const units = Math.max(1, Math.min(kMaxUnits, Math.floor(energy / kUnitCost)));
        return [
            ..._.times(units, () => WORK),
            ..._.times(units, () => CARRY),
            ..._.times(2 * units, () => MOVE),
        ] as BodyPartConstant[];
    }

    // The home room's spawns only, the body sized to the room's capacity,
    // an idle spawn with the whole cost in hand.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const home = this.mission.getRoomName("home");
        const pool = spawns.filter(s => s.room.name === home);
        if (!pool.length) return [null, []];
        const body = Prospector.body(pool[0].room.energyCapacityAvailable);
        const cost = _.sum(body, part => BODYPART_COST[part]);
        const ready = pool.filter(s => !s.spawning && s.room.energyAvailable >= cost);
        if (!ready.length) return [null, body];
        return [_.sample(ready), body];
    }

    get cc(): CreepMove {
        return this.c as CreepMove;
    }

    donatable(): number {
        return 0;
    }

    get inKeeperRoom(): boolean {
        return roomKind(this.mission.roomName) === Kind.SourceKeeper;
    }

    init(): boolean {
        if (this.inKeeperRoom && !this.memory.rewalksk) this.memory.rewalksk = true;
        return true;
    }

    get carrying(): number {
        return this.c.store.getUsedCapacity();
    }

    get full(): boolean {
        return this.c.store.getFreeCapacity() === 0;
    }

    // Every WORK part gone (with hits lost, so a fresh creep never counts).
    get broken(): boolean {
        const c = this.cc;
        return c.hurts > 0 && !c.activeByType.get(WORK);
    }

    // An armed enemy other than a Source Keeper in the mission room.
    get threatened(): boolean {
        const room = this.mission.room;
        return !!room && _.any(room.hostiles || [], h => !h.keeper);
    }

    start(): Task2Ret {
        const c = this.cc;
        if (c.room.name === this.mission.roomName && this.inKeeperRoom && fleeKeepers(c)) return "wait";

        if (this.broken) return this.goHome(true);
        if (this.threatened) return this.goHome(false);

        const old = this.ticksToLive < kHomeTTL;
        if (this.unloadLatch(this.full || (old && this.carrying > 0))) return this.goHome(false);
        if (this.ticksToLive < kRecycleTTL && this.pos.roomName === this.homeName) return this.recycle();
        if (old) return this.goHome(false);

        return this.mine();
    }

    // Home: unload whatever is carried (at the controller when home has no
    // store); then recycle when told to (broken), else wait there.
    goHome(recycle: boolean): Task2Ret {
        const homeName = this.homeName;
        if (this.carrying > 0) {
            const ret = this.unloadHome(homeName);
            if (ret !== null) return ret;
            const ctrl = Game.rooms[homeName]?.controller;
            if (ctrl) return this.dropAt(ctrl);
            this.log("nowhere to unload in", homeName);
            return "wait";
        }
        if (this.pos.roomName !== homeName) return this.moveRoom(homeName);
        if (recycle) return this.recycle();
        return "wait";
    }

    // Walk to the spot (mineralSpot(), else beside the mineral) and harvest.
    mine(): Task2Ret {
        const room = this.mission.room;
        if (!room) return this.moveRoom(this.mission.roomName);
        const mineral = roomMineral(room);
        if (!mineral) {
            this.log("no mineral in", room.name);
            return "wait";
        }
        const spot = (this.mission as unknown as ProspectMission).mineralSpot?.() || null;
        if (spot) {
            if (!this.pos.isEqualTo(spot)) return this.movePos(spot, 0);
        } else if (!this.pos.isNearTo(mineral)) {
            return this.moveTarget(mineral, 1);
        }
        if (!mineral.mineralAmount) return "wait";
        const err = this.c.harvest(mineral);
        if (err !== OK && err !== ERR_TIRED) this.log("harvest", mineral.mineralType, "failed", err);
        return "wait";
    }

    // Hand the body back at the nearest spawn in this room; none, die.
    @task
    recycle(): Task2Ret {
        const spawn = this.pos.findClosestByRange(this.c.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn) {
            this.log("no spawn to recycle at in", this.c.room.name);
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
