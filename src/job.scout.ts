import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { defaultRewalker } from "Rewalker";
import type { CreepMove } from "creep.move";

const rewalker = defaultRewalker();

// Distance a scout keeps from hostiles in its target room: close enough to
// keep them in sight, out of reach. Ranged attackers hit at 3, so 5 leaves a
// margin; melee-only hostiles are kited at 3.
const kShadowRanged = 5;
const kShadowMelee = 3;

function shadowRange(h: Creep): number {
    return h.getActiveBodyparts(RANGED_ATTACK) ? kShadowRanged : kShadowMelee;
}

@register
export class Scout extends JobCreep {
    // Cheap and unblocking: vision gates whole missions, so jump the 0-priority queue.
    priority = 7;
    spawn(spawns: StructureSpawn[]): [StructureSpawn|null, BodyPartConstant[]] {
        // A mission's designated spawn room is the only choice when it names one.
        const spawnName = this.mission.getRoomName("spawn");
        if (spawnName) return [_.sample(spawns.filter(s => s.room.name === spawnName)) || null, [MOVE]];
        // Prefer the mission's home room when it names one; otherwise any spawn.
        const homeName = this.mission.getRoomName("home");
        const homeSpawns = spawns.filter(s => s.room.name === homeName);
        return [_.sample(homeSpawns.length ? homeSpawns : spawns), [MOVE]];
    }

    start(): Task2Ret {
        this.dlog("heading to", this.mission.roomName);
        // In the target room, hostiles get shadowed (shadowRange); with none,
        // foreign construction sites get stomped.
        if (this.pos.roomName === this.mission.roomName) {
            const busy = this.shadow() || this.stomp();
            if (busy) return busy;
        }
        const ret = this.moveRoom(this.mission.roomName);
        if (ret !== "start") return ret;
        // Arrived. Keep drifting toward the middle of the room: parked near
        // an exit the scout gets bounced across the border and loses the
        // vision it was spawned for.
        return this.moveRoom(this.mission.roomName, 2525, 15);
    }

    // Walk onto the nearest foreign construction site: a hostile creep
    // stepping on a site destroys it. Sites under an obstacle or a rampart
    // are out of reach, and a safe-moded controller protects the owner's.
    // null when there is nothing to stomp.
    stomp(): Task2Ret | null {
        const room = this.c.room;
        if (room.controller?.safeMode && !room.controller.my) return null;
        const sites = room.find(FIND_HOSTILE_CONSTRUCTION_SITES, {
            filter: s => !_.any(s.pos.lookFor(LOOK_STRUCTURES),
                t => t.structureType === STRUCTURE_RAMPART || OBSTACLE_OBJECT_TYPES.includes(t.structureType as any)),
        });
        const site = this.pos.findClosestByRange(sites);
        if (!site) return null;
        this.moveTarget(site, 0);
        return "wait";
    }

    // Shadow the armed hostiles (Source Keepers excluded), each at its
    // shadowRange: 5 from anything with ranged attack, 3 from melee-only.
    // Flee when any is inside its range, otherwise close on the one with the
    // least slack (distance - range), holding once that slack is 0. null when
    // the room has no hostiles.
    shadow(): Task2Ret | null {
        const c = this.c as CreepMove;
        const hostiles = c.room.hostiles.filter(h => !h.keeper);
        if (!hostiles.length) return null;
        const slack = (h: Creep) => this.pos.getRangeTo(h) - shadowRange(h);
        const target = _.min(hostiles, slack);
        const s = slack(target);
        if (s < 0) {
            c.idleFlee(hostiles, shadowRange);
            return "wait";
        }
        if (s > 0) this.moveTarget(target, shadowRange(target));
        return "wait";
    }
}