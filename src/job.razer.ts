import { JobCreep } from "job.creep";
import { register, taskbroken, Task2Ret } from "mycreep";
import { defaultRewalker } from "Rewalker";
import { dozerSpawn, dozeable, dozeableStruct } from "job.bulldozer";
import { stompable } from "job.scout";

const rewalker = defaultRewalker();

// Ticks with nothing to raze or stomp before the razer decommissions.
export const kIdleTicks = 10;

declare global {
    interface CreepMemory {
        // Razer: the target it is walking to, kept while it is still one
        // of targets() so the walk is planned once.
        razeId?: Id<Structure>
        // Razer: ticks in a row with nothing to do in the mission room.
        idle?: number
        // Razer: done, walking back to its spawn to be recycled.
        decomm?: boolean
    }
}

// The structures in `room` a razer takes down: not ours and dismantleable
// (job.bulldozer dozeableStruct: roads and containers are walked over, not
// through; invader cores and power banks shrug dismantle off).
export function razeTargets(room: Room): Structure[] {
    return room.find(FIND_STRUCTURES, { filter: dozeableStruct });
}

// A safe-moded controller that is not ours protects everything in the room.
function safeModed(room: Room): boolean {
    return !!room.controller?.safeMode && !room.controller.my;
}

// Clears a room of what others left behind, for the Raze mission
// ("Raze <room> [home]"). On the Bulldozer body (2 WORK per MOVE, from the
// spawns nearest home). In the mission room it dismantles every structure
// that is not ours, cheapest walk first (Rewalker.planWalk over all of
// them; a rampart on the tile goes first, as it shields the rest), then
// walks onto the foreign construction sites the way a Scout does, which
// removes them. After kIdleTicks ticks with nothing left it decommissions:
// back to the spawn that hatched it (memory.nest; else a spawn in the home
// room) to be recycled, or suicide with no spawn to go to. The mission winds
// down when it sees the razer decommission. Canopener (job.canopener.ts)
// narrows it to the ramparts over a stronghold's containers (targets(),
// stomp(), idleTicks).
@register
export class Razer extends JobCreep {
    // Ticks in a row with nothing to do before decommissioning.
    idleTicks = kIdleTicks;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return dozerSpawn(spawns, this.homeName);
    }

    get roomName(): string {
        return this.mission.roomName;
    }

    start(): Task2Ret {
        if (this.memory.decomm) return this.decomm();
        if (this.pos.roomName !== this.roomName) {
            const ret = this.moveRoom(this.roomName);
            if (ret !== "start") return ret;
        }
        const work = this.raze() || this.stomp();
        if (work) {
            this.memory.idle = 0;
            return work;
        }
        const idle = (this.memory.idle || 0) + 1;
        this.memory.idle = idle;
        if (idle < this.idleTicks) return "wait";
        this.log("nothing left to raze in", this.roomName, "for", idle, "ticks, decommissioning");
        this.memory.decomm = true;
        return this.decomm();
    }

    // What there is to dismantle in the room we stand in: every structure
    // another player left (razeTargets), none under a foreign safe mode.
    targets(): Structure[] {
        const room = this.c.room;
        if (safeModed(room)) return [];
        return razeTargets(room);
    }

    // Dismantle the target with the cheapest walk, or null with none. The
    // one it is already walking to (memory.razeId) is kept while it is
    // still a target: the walk is stored, and a search a tick is what ate
    // the CPU (Oct 2026; @task does not persist, docs/known-issues.md).
    raze(): Task2Ret | null {
        const targets = this.targets();
        if (!targets.length) return null;
        const near = _.find(targets, t => this.pos.isNearTo(t));
        if (near) return this.chew(near);
        const kept = this.memory.razeId && Game.getObjectById(this.memory.razeId);
        if (kept && _.contains(targets, kept)) return this.chew(kept);
        delete this.memory.razeId;
        const i = rewalker.planWalk(this.c, targets.map(t => ({ pos: t.pos, range: 1 })));
        const target = i >= 0 ? targets[i] : this.pos.findClosestByRange(targets);
        if (target) this.memory.razeId = target.id;
        return target ? this.chew(target) : null;
    }

    // Walk onto the nearest foreign construction site (Scout.stomp), or
    // null with none reachable.
    stomp(): Task2Ret | null {
        const room = this.c.room;
        if (safeModed(room)) return null;
        const site = this.pos.findClosestByRange(stompable(room));
        if (!site) return null;
        return this.moveTarget(site, 0);
    }

    @taskbroken
    chew(target: Structure): Task2Ret {
        if (!target || !dozeableStruct(target)) return "start";
        if (!this.pos.isNearTo(target)) return this.moveTarget(target, 1);
        // A rampart on the tile shields the rest: it comes down first.
        const struct = _.first(dozeable(target.pos)) || target;
        const err = this.c.dismantle(struct);
        if (err !== OK) {
            this.log("dismantle", struct, "failed", err);
            return "start";
        }
        return "wait";
    }

    // Hand the body back at the origin spawn (JobCreep.recycleAt); with no
    // spawn to go to, die.
    @taskbroken
    decomm(): Task2Ret {
        return this.recycleAt(this.originSpawn());
    }
}
