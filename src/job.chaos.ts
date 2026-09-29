import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { CreepMove } from "creep.move";
import { closeSpawns } from "spawnold";
import { whoami } from "Rewalker";
import type { Nidoran } from "ms.nidoran";

// 4 MOVE, the WORK, then a MOVE: the damage sponge is all MOVE, the last
// MOVE keeps it moving after the WORK is gone. 350 energy.
export const kChaosBody: BodyPartConstant[] = [MOVE, MOVE, MOVE, MOVE, WORK, MOVE];
const kChaosCost = _.sum(kChaosBody, p => BODYPART_COST[p]);
// An armed creep this close sends the chaos fleeing...
const kFleeTrigger = 5;
// ...until every one of them is this far, through up to kFleeRooms rooms.
const kFleeRange = 7;
const kFleeRooms = 2;
// Ticks after a flight before heading back toward the active room, so a
// flight over an exit is not undone next tick while the threat waits there
// (the pair otherwise ping-pong across the edge every tick).
const kFleeHold = 3;
// Under either the chaos walks into the nearest room we own and stays.
const kRetreatHits = 100;
const kRetreatTTL = 100;
// idleDismantle: only this close (rooms, linear) to the mission room.
const kIdleRooms = 2;
// Structures a chaos never dismantles: no hits, or hits by the million.
const kNoChaos: StructureConstant[] = [
    STRUCTURE_INVADER_CORE, STRUCTURE_POWER_BANK, STRUCTURE_WALL, STRUCTURE_RAMPART,
    STRUCTURE_KEEPER_LAIR, STRUCTURE_PORTAL, STRUCTURE_CONTROLLER,
];

declare global {
    interface CreepMemory {
        // Chaos: the owned room it retreats into, once hurt or old.
        retreat?: string
        // Chaos: the tick it last fled (kFleeHold).
        fled?: number
    }
}

// What a chaos in `room` may dismantle: not ours, with hits, not kNoChaos.
export function chaosTargets(room: Room): Structure[] {
    return room.find(FIND_STRUCTURES, {
        filter: s => !(s as OwnedStructure).my && s.hits > 0 && !_.contains(kNoChaos, s.structureType),
    });
}

// Remote-room harasser for the Nidoran mission (ms.nidoran.ts). A cheap
// 5 MOVE 1 WORK dismantler from the "close" spawns of the mission room
// (spawnold.closeSpawns: within a hop of the nearest). It walks to that room and dismantles what it
// finds there (chaosTargets: roads and containers, mostly), picking the
// target furthest from its sibling chaos in the room so the pair spread
// out, nearest to itself among those. It is jumpy: an armed creep (not a
// Source Keeper) within kFleeTrigger sends it fleeing until all of them
// are kFleeRange away, across a room edge if need be. Under kRetreatHits
// hits or kRetreatTTL ticks to live it walks into the nearest room we own
// (by route) and stays there. Whatever it is doing, in a room not reserved
// by us within kIdleRooms of the mission room it dismantles a structure it
// stands beside when nothing else has used its WORK this tick
// (idleDismantle, from after()).
@register
export class Chaos extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // The "close" set: spawns within one hop of the nearest to the
        // mission room (W27S5 and W25S7 for W23S4), whichever is free with
        // the energy.
        const close = closeSpawns(spawns, this.mission.roomName) as StructureSpawn[];
        const spawn = _.find(close, s => !s.spawning && s.room.energyAvailable >= kChaosCost);
        return [spawn || null, kChaosBody];
    }

    get mission(): Nidoran {
        return super.mission as Nidoran;
    }

    get cc(): CreepMove {
        return this.c as CreepMove;
    }

    // Time to head home?
    get spent(): boolean {
        return !!this.memory.retreat || this.c.hits < kRetreatHits || this.c.ticksToLive! < kRetreatTTL;
    }

    // Armed creeps (Source Keepers aside) in the room.
    get threats(): Creep[] {
        return (this.c.room.hostiles || []).filter(h => !h.keeper);
    }

    get threatened(): boolean {
        return this.pos.findInRange(this.threats, kFleeTrigger).length > 0;
    }

    start(): Task2Ret {
        if (this.spent) return this.retreat();
        if (this.flee()) return "wait";
        // Once over the edge the razing starts where it stands.
        const active = this.mission.active;
        if (this.pos.roomName !== active) {
            if (Game.time - (this.memory.fled || 0) < kFleeHold) return "wait";
            return this.moveRoom(active);
        }
        return this.raze() || "wait";
    }

    // Step away from every threat until all are kFleeRange off; false when
    // none is within kFleeTrigger.
    flee(): boolean {
        if (!this.threatened) return false;
        this.dlog("fleeing");
        this.memory.fled = Game.time;
        return !!this.cc.idleFlee(this.threats, kFleeRange, kFleeRooms);
    }

    // Dismantle the target furthest from the sibling chaos in the room
    // (nearest to us among equals); with no sibling here the nearest. Null
    // with nothing to dismantle.
    raze(): Task2Ret | null {
        const room = this.c.room;
        if (room.controller?.safeMode && !room.controller.my) return null;
        const targets = chaosTargets(room);
        if (!targets.length) return null;
        const sibs = this.mission.roleCreeps(this.role)
            .filter(s => s.name !== this.name && s.c && s.pos.roomName === room.name);
        let target: Structure | null;
        if (sibs.length) {
            target = _.max(targets, t => _.min(sibs.map(s => s.pos.getRangeTo(t))) * 100 - this.pos.getRangeTo(t));
        } else {
            target = this.pos.findClosestByRange(targets);
        }
        return target ? this.dismantle(target) : null;
    }

    @task
    dismantle(target: Structure): Task2Ret {
        // Danger and age are start()'s to handle.
        if (this.spent || this.threatened) return "start";
        if (!target || (target as OwnedStructure).my || !target.hits) return "start";
        if (!this.pos.isNearTo(target)) return this.moveTarget(target, 1);
        if (!this.doDismantle(target)) return "start";
        return "wait";
    }

    // One dismantle intent; WORK, ATTACK and RANGED_ATTACK share a pipeline,
    // so like build/repair it takes the melee and range intents. A road is
    // also stepped onto while it comes down: only roads reach the room edge,
    // and a chaos dismantling one from the exit tile it arrived on was
    // carried back over the edge every tick (W23S4, Sept 2026). A plain
    // move, not the Rewalker, so nothing gets bumped for it.
    doDismantle(target: Structure): boolean {
        const c = this.cc;
        if (c.intents.melee || c.intents.range) return false;
        const err = c.dismantle(target);
        if (err !== OK) {
            this.log("dismantle", target, "failed", err);
            return false;
        }
        c.intents.melee = c.intents.range = target;
        if (target.structureType === STRUCTURE_ROAD && !c.intents.move && !this.pos.isEqualTo(target.pos)) {
            c.moveDir(this.pos.getDirectionTo(target));
        }
        return true;
    }

    // Nothing else used the WORK this tick: take a swing at a chaosTarget
    // beside us, in any room not reserved by us within kIdleRooms of the
    // mission room (the walk in, a flight, a room just left).
    idleDismantle(): boolean {
        const c = this.cc;
        if (c.intents.melee || c.intents.range) return false;
        const room = c.room;
        if (room.controller?.my || room.controller?.reservation?.username === whoami()) return false;
        if (Game.map.getRoomLinearDistance(room.name, this.mission.roomName) > kIdleRooms) return false;
        if (room.controller?.safeMode && !room.controller.my) return false;
        const near = _.filter(chaosTargets(room), t => this.pos.isNearTo(t));
        const target = _.max(near, t => t.hits) as Structure | undefined;
        if (!target || !near.length) return false;
        return this.doDismantle(target);
    }

    after() {
        if (!this.c) return;
        this.idleDismantle();
    }

    // Walk into the nearest room we own and stay there.
    retreat(): Task2Ret {
        let dest = this.memory.retreat;
        if (!dest) {
            dest = this.mission.nearestHome(this.pos.roomName)[0] || undefined;
            if (!dest) {
                this.log("no owned room to retreat to");
                return "wait";
            }
            this.log("retreating to", dest, "hits", this.c.hits, "ttl", this.c.ticksToLive);
            this.memory.retreat = dest;
        }
        if (this.flee()) return "wait";
        const { x, y } = this.pos;
        const onExit = x === 0 || y === 0 || x === 49 || y === 49;
        if (this.pos.roomName === dest && !onExit) return "wait";
        const ret = this.moveRoom(dest);
        return ret === "start" ? "wait" : ret;
    }
}
