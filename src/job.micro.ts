import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";
import { closeSpawns } from "spawnold";
import { roomCenterPos } from "intel";

// The cheapest answer to an unarmed enemy loitering in a mission's room
// (a scout, a hauler, a lone healer): one RANGED_ATTACK and one MOVE, 200
// energy. Farm, Remote, Hub and Thorhub lay one per lifetime (paceNJobs(Micro, 1)) once
// enemy creeps have been in the room for 50 ticks (memory.tenemies) with no
// armed hostile among them (suppress.ts suppressMicro).
//
// It only ever targets enemies without RANGED_ATTACK (never Source Keepers):
// those cannot shoot back at range. From anything that can it runs. A melee
// target is shot from range 3 and kited; anything else is chased to range 1
// so a fleeing target stays in reach.

// Distance kept from ranged enemies and from a melee target.
const kFleeRange = 5;
const kKiteRange = 3;

@register
export class Micro extends JobRole {
    // As Mini: ahead of the civilian eggs, behind srcers.
    priority = 7;

    static readonly body: BodyPartConstant[] = [RANGED_ATTACK, MOVE];

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const pool = closeSpawns(spawns, this.mission.roomName) as StructureSpawn[];
        const spawn = _.find(pool, s => !s.spawning) || _.first(pool);
        if (!spawn) return [null, []];
        return [spawn, Micro.body];
    }

    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    // Enemy creeps in the current room, Source Keepers excluded.
    get enemies(): Creep[] {
        return (this.cc.room.enemies || []).filter(e => !e.keeper);
    }

    start(): Task2Ret {
        const c = this.cc;
        const enemies = this.enemies;
        const ranged = enemies.filter(e => e.getActiveBodyparts(RANGED_ATTACK) > 0);
        const target = this.pos.findClosestByRange(enemies.filter(e => !e.getActiveBodyparts(RANGED_ATTACK)));
        if (target) this.shoot(target);

        if (ranged.length && c.idleFlee(ranged, kFleeRange)) return "wait";
        if (!target) {
            if (ranged.length) return "wait";
            if (this.pos.roomName !== this.mission.roomName) return this.moveRoom(this.mission.roomName);
            return this.hold();
        }
        if (target.melee) {
            if (c.idleFlee([target], kKiteRange)) return "wait";
            if (!this.pos.inRangeTo(target, kKiteRange)) this.moveTarget(target, kKiteRange);
            return "wait";
        }
        if (!this.pos.isNearTo(target)) this.moveTarget(target, 1);
        return "wait";
    }

    shoot(target: Creep) {
        const c = this.cc;
        if (c.intents.range || !this.pos.inRangeTo(target, 3)) return;
        const err = c.rangedAttack(target);
        if (err === OK) c.intents.range = target;
        else this.log("rangedAttack failed", err, target);
    }

    hold(): Task2Ret {
        const center = roomCenterPos(this.pos.roomName);
        if (!this.pos.inRangeTo(center, 3)) this.movePos(center, 3);
        return "wait";
    }
}
