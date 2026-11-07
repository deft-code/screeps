import { JobCreep } from "job.creep";
import { register, Task2Ret } from "mycreep";
import { defaultRewalker, atExit } from "Rewalker";
import { dozeable } from "job.bulldozer";
import { TStruct } from "tstruct";
import type { InvaderCoreThree } from "ms.invadercorethree";

// Corecleaner: opens a beaten stronghold for the InvaderCore missions
// (ms.invadercorethree.ts). 25 WORK, 25 MOVE (3750 energy, 1250 hits a
// tick dismantling) from the mission's home room, laid when the core is
// about to fall.
//
// While the core stands (approach): toward the mission's spot, stopping
// kWaitRange from it. The walk is planned to range 1 of the spot and then
// walked at range kWaitRange: walkTo never replans a stored walk to the
// same destination, whatever range it is asked for (Rewalker.walkingTo),
// so the cleaner stops early on the very path that leads all the way in,
// not wherever a search to range kWaitRange would have ended. A range
// never reaches into another room, so that is the first tile off the edge
// of the core's room (an exit tile would bounce it back out) that is
// within kWaitRange of the spot. The stronghold's towers fire at the
// hostile nearest the core, the drill on its spot; with no drill in the
// room, or once a tower has hit it (the room's event log; memory.backoff),
// the cleaner backs out of the room toward home and waits there. A tile
// within a keeper's reach is walked on from, like an exit tile.
//
// Once the core is gone (towers and defenders are dead weight without
// it), clean():
//   1. the mission's listed targets in order (InvaderCoreThree.targets:
//      what stands between a sweeper and the loot);
//   2. none listed: the rampart beside us with the fewest hits;
//   3. none beside us: one walk planned over every rampart
//      (Rewalker.planWalk), to the one it ends at;
//   4. no ramparts left: the towers, the same way;
//   5. nothing left: suicide.
// What it is working on is kept as a TStruct (target). It never dismantles
// a container: only ramparts and towers are ever picked, and what is
// dismantled on a target's tile is the rampart first (dozeable).
const kWork = 25;
const kMove = 25;
const kWaitRange = 40;
// Stop this far short of a spot we cannot wait within range of.
const kEntryRange = 3;
// A keeper shoots this far.
const kKeeperReach = 3;

declare global {
    interface CreepMemory {
        // Corecleaner: shot at in the core's room while the core stood;
        // it stays out until the core is gone.
        backoff?: boolean
    }
}

const rewalker = defaultRewalker();

@register
export class Corecleaner extends JobCreep {
    static readonly body: BodyPartConstant[] = [
        ..._.times(kWork, () => WORK),
        ..._.times(kMove, () => MOVE),
    ] as BodyPartConstant[];

    static readonly cost = _.sum(Corecleaner.body, part => BODYPART_COST[part]);

    // Hits a tick one cleaner dismantles.
    static readonly power = kWork * DISMANTLE_POWER;

    // The loot waits on it.
    priority = 3;

    // The structure being walked to or dismantled.
    target: TStruct | null = null;

    // Our hits the tick before, while in the core's room (approach).
    private lastHits?: number;

    get coreMission(): InvaderCoreThree {
        return this.mission as unknown as InvaderCoreThree;
    }

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const spawn = this.readySpawn(spawns, Corecleaner.cost);
        return spawn ? [spawn, Corecleaner.body] : [null, []];
    }

    start(): Task2Ret {
        const m = this.coreMission;
        if (!m) return "wait";
        if (!m.coreDead) return this.approach();
        if (this.pos.roomName !== m.roomName) {
            const spot = m.spotPos;
            if (spot) this.movePos(spot, kEntryRange);
            else this.moveRoom(m.roomName);
            return "wait";
        }
        return this.clean();
    }

    // The core stands: wait kWaitRange from the spot (file header).
    approach(): Task2Ret {
        const m = this.coreMission;
        const spot = m.spotPos;
        if (!spot) return "wait";
        const c = this.c;
        const inRoom = this.pos.roomName === spot.roomName;
        const edge = atExit(this.pos);
        // The event log is read only on a tick our hits fell in the room.
        const fell = inRoom && this.lastHits !== undefined && c.hits < this.lastHits;
        this.lastHits = inRoom ? c.hits : undefined;
        if (fell && !this.memory.backoff && this.towerShot()) {
            this.log("shot by a tower in", spot.roomName, "; backing off until the core is gone");
            this.memory.backoff = true;
        }
        if (!m.drillOnSite() || this.memory.backoff) {
            // Out of the room and one step off its edge, then hold.
            if (inRoom || edge) this.moveRoom(this.homeName);
            return "wait";
        }
        // No waiting on an exit tile (it bounces us out) or in a keeper's
        // reach (a room's way in may pass one): on along the path.
        const pressed = edge
            || (inRoom && this.pos.findInRange(FIND_HOSTILE_CREEPS, kKeeperReach, { filter: e => e.keeper }).length > 0);
        if (inRoom && !pressed && this.pos.inRangeTo(spot, kWaitRange)) return "wait";
        // A stored walk with no steps left is one a detour replanned at the
        // wide range and that ran out short of the room: plan again at 1.
        const planned = rewalker.walkingTo(c, spot) && rewalker.walkSteps(c) > 0;
        this.walkTo(spot, planned && !pressed ? kWaitRange : 1);
        return "wait";
    }

    // A tower hit us last tick (the room's event log): a keeper's shot on
    // the way in does not count.
    towerShot(): boolean {
        const id = this.c.id;
        return _.any(this.c.room.getEventLog(), e => e.event === EVENT_ATTACK && e.data.targetId === id
            && Game.getObjectById(e.objectId as Id<Structure>) instanceof StructureTower);
    }

    // The core is gone: the ladder of the file header.
    clean(): Task2Ret {
        const room = this.c.room;
        const listed = _.first(this.coreMission.targets());
        if (listed) return this.chew(listed);
        const structs = room.find(FIND_HOSTILE_STRUCTURES);
        const ramparts = structs.filter(s => s.structureType === STRUCTURE_RAMPART && s.hits > 0);
        if (ramparts.length) {
            const beside = ramparts.filter(r => this.pos.isNearTo(r));
            if (beside.length) return this.chew(_.min(beside, r => r.hits));
            return this.chew(this.nearest(ramparts));
        }
        const towers = structs.filter(s => s.structureType === STRUCTURE_TOWER);
        if (towers.length) return this.chew(this.nearest(towers));
        this.log("nothing left to clean in", room.name, "; suicide");
        this.c.suicide();
        return "wait";
    }

    // The one of `list` we are already walking to, else the one a single
    // walk planned over them all ends at (the walk is stored, so the
    // walkTo that follows takes it as it is); by range when no walk is found.
    nearest(list: Structure[]): Structure {
        const kept = this.target?.s;
        if (kept && _.any(list, s => s.id === kept.id)) return kept;
        const i = rewalker.planWalk(this.c, list.map(s => ({ pos: s.pos, range: 1 })));
        return i >= 0 ? list[i] : (this.pos.findClosestByRange(list) || list[0]);
    }

    // Walk beside `target` and dismantle what stands on its tile, the
    // rampart first.
    chew(target: Structure): Task2Ret {
        if (this.target?.id !== target.id) this.target = TStruct.make(target);
        if (!this.pos.isNearTo(target)) {
            this.moveTarget(target, 1);
            return "wait";
        }
        const struct = _.first(dozeable(target.pos)) || target;
        const err = this.dismantle(struct);
        if (err !== OK) this.log("dismantle", struct, "failed", err);
        return "wait";
    }
}
