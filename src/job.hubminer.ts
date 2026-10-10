import { JobCreep } from "job.creep";
import { CreepRole } from "creep.role";
import { register, Task2Ret } from "mycreep";
import { fromXY } from "Rewalker";

// The ordinary mineral miner of a Hub room: the job-layer replacement for
// role.mineral.ts. It stands on the Meta_min 'mineral' spot (the container
// tile beside the mineral, planned by the min genesis child flag) and drop
// mines the room's mineral into that container: no CARRY, every harvest
// lands on the tile and the container takes it. It never swings when the
// container has less free space than one harvest yields (info.mineral:
// active WORK x HARVEST_MINERAL_POWER), so nothing spills on the floor.
//
// Laid by Hub (and so Thorhub) with nJobs(Hubminer, Hubminer.want(room)):
// one while the room's Meta_min has its extractor built on a mineral that
// is not thorium and still has something in it, and the room's storage and
// terminal together hold under kStockCap of that mineral. Thorium belongs to the
// Thormine mission's thoreaters (Meta_reactor); a hubminer never touches
// it: the mineral it mines is the one under its meta's extractor, checked
// for type every tick, never the first mineral in the room.
//
// Body: 2 WORK per MOVE, as many as the room's energy capacity allows
// (kMaxUnits of WORK, WORK, MOVE: 32 WORK, 16 MOVE, 4000 energy at 50
// parts), spawned in the mission room only, and only when the spawn room
// holds the whole body's energy now: a half-size miner is not worth the
// 1500 ticks it would hold the spot.
//
// Mined out and standing idle it walks to a spawn to be recycled, so the
// body's energy comes back.

// WORK, WORK, MOVE units: 16 is the 50-part cap.
const kMaxUnits = 16;
const kUnitCost = 2 * BODYPART_COST[WORK] + BODYPART_COST[MOVE];
// Ticks between log lines while waiting on a missing container.
const kLogPace = 100;
// No miner while storage + terminal hold this much of the mineral.
const kStockCap = 100000;

@register
export class Hubminer extends JobCreep {
    // The body a room of `ecap` capacity affords; empty below one unit.
    static body(ecap: number): BodyPartConstant[] {
        const units = Math.min(kMaxUnits, Math.floor(ecap / kUnitCost));
        if (units < 1) return [];
        return [..._.times(units * 2, () => WORK), ..._.times(units, () => MOVE)] as BodyPartConstant[];
    }

    // The Meta_min of `room`, or null when none is planned.
    static meta(room: Room) {
        return room.meta.getMeta("min");
    }

    // The mineral under the meta's planned extractor, when that extractor
    // stands (ours) and the mineral is not thorium; null otherwise.
    static mineral(room: Room): Mineral | null {
        const meta = Hubminer.meta(room);
        const xy = meta?.getSite(STRUCTURE_EXTRACTOR);
        if (!xy) return null;
        const pos = fromXY(xy, room.name);
        const extractor = _.find(pos.lookFor(LOOK_STRUCTURES), s => s.structureType === STRUCTURE_EXTRACTOR) as StructureExtractor | undefined;
        if (!extractor?.my) return null;
        const mineral = _.first(pos.lookFor(LOOK_MINERALS));
        if (!mineral || mineral.mineralType === RESOURCE_THORIUM) return null;
        return mineral;
    }

    // The room's stock of `res` in its storage and terminal.
    static stock(room: Room, res: ResourceConstant): number {
        return _.sum([room.storage, room.terminal], s => (s?.my && s.store[res]) || 0);
    }

    // How many Hub should keep: one while there is a mineral to mine and
    // the room is not already sitting on kStockCap of it.
    static want(room: Room | null | undefined): number {
        if (!room?.controller?.my) return 0;
        const mineral = Hubminer.mineral(room);
        if (!mineral || mineral.mineralAmount <= 0) return 0;
        return Hubminer.stock(room, mineral.mineralType) < kStockCap ? 1 : 0;
    }

    // The mission room's own spawns, one of them idle and the room holding
    // the energy for the largest body its capacity allows; else wait.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room) return [null, []];
        const body = Hubminer.body(room.energyCapacityAvailable);
        if (!body.length) return [null, []];
        const cost = _.sum(body, part => BODYPART_COST[part]);
        if (room.energyAvailable < cost) return [null, []];
        const local = spawns.filter(s => s.room.name === room.name && !s.spawning);
        if (!local.length) return [null, []];
        return [_.sample(local), body];
    }

    get cc(): CreepRole {
        return this.c as CreepRole;
    }

    // The container tile: the meta's 'mineral' spot.
    get spot(): RoomPosition | null {
        const room = this.mission.room;
        const xy = room && Hubminer.meta(room)?.getSpot("mineral");
        return xy ? fromXY(xy, room!.name) : null;
    }

    start(): Task2Ret {
        const spot = this.spot;
        if (!spot) {
            this.log("no min meta in", this.mission.roomName);
            return "wait";
        }
        if (!this.pos.isEqualTo(spot)) {
            this.movePos(spot, 0);
            return "wait";
        }
        const room = this.cc.room;
        const mineral = Hubminer.mineral(room);
        if (!mineral) {
            this.dlog("no mineral to mine");
            return "wait";
        }
        if (mineral.mineralAmount <= 0) return this.recycle();

        const cont = _.find(spot.lookFor(LOOK_STRUCTURES), s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer | undefined;
        if (!cont) {
            if (Game.time % kLogPace === 0) this.log("no container on", spot);
            return "wait";
        }
        if (cont.store.getFreeCapacity() < this.cc.info.mineral) return "wait";

        const err = this.c.harvest(mineral);
        if (err === OK) {
            this.cc.intents.melee = this.cc.intents.range = mineral;
        } else if (err !== ERR_TIRED) {
            this.log("harvest failed", err);
        }
        return "wait";
    }

    // Mined out: hand the body back at the nearest spawn in the room.
    recycle(): Task2Ret {
        const spawn = this.pos.findClosestByRange(this.cc.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn) {
            this.log("mined out, no spawn to recycle at, suiciding");
            this.c.suicide();
            return "wait";
        }
        if (!this.pos.isNearTo(spawn)) {
            this.moveTarget(spawn, 1);
            return "wait";
        }
        const err = spawn.recycleCreep(this.c);
        if (err !== OK) this.log("recycle failed", err);
        return "wait";
    }
}
