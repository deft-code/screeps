import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import { defaultRewalker, fromXY } from "Rewalker";

const rewalker = defaultRewalker();

// Body budget: 25 WORK + 25 MOVE is the 50-part cap.
const kMaxBodyEnergy = 25 * (BODYPART_COST[WORK] + BODYPART_COST[MOVE]);
// The dismantle boost.
export const kDozerBoost = RESOURCE_CATALYZED_ZYNTHIUM_ACID;

// Structure types a bulldozer never counts as a target: walked over, not through.
const kWalkedOver: StructureConstant[] = [STRUCTURE_ROAD, STRUCTURE_CONTAINER];
// Has hits, yet dismantle does nothing to it.
const kUndozeable: StructureConstant[] = [STRUCTURE_INVADER_CORE, STRUCTURE_POWER_BANK];

declare global {
    interface CreepMemory {
        // Bulldozer: a lab refused us once, stop asking.
        noboost?: boolean
    }
}

interface DozerMission {
    dozePositions?(): RoomPosition[]
}

// Could a bulldozer take this structure down? Not ours, has hits, and not one
// of the types above. Ramparts count (a hostile one blocks the tile).
export function dozeableStruct(s: Structure): boolean {
    if ((s as OwnedStructure).my) return false;
    // hits only: a rampart whose owner lost the controller reads hitsMax 0
    // and still stands with millions of hits.
    if (!s.hits) return false;
    return !_.contains(kWalkedOver, s.structureType) && !_.contains(kUndozeable, s.structureType);
}

// What stands on a tile to be dismantled, the rampart first: it shields the
// rest. Empty without vision of the room.
export function dozeable(pos: RoomPosition): Structure[] {
    if (!Game.rooms[pos.roomName]) return [];
    const structs = _.filter(pos.lookFor(LOOK_STRUCTURES), dozeableStruct);
    return _.sortBy(structs, s => s.structureType === STRUCTURE_RAMPART ? 0 : 1);
}

// Dismantler for the Bulldoze mission ("Bulldoze <target> <home>"). The
// mission keeps the list of tiles to clear (dozePositions); the job plans one
// walk over all of them with the regular Rewalker matrix, so it ends up next
// to whichever it can reach cheapest (the outermost wall of the mission's
// planned breach, usually), and dismantles what stands there. Tiles vanish
// from the mission's list once they are clear.
//
// While in its home room with unboosted WORK parts it asks the labs for
// XZH2O (room.requestBoost; the Chemist fills the lab) and takes the boost
// when a lab has it ready. The mission asks too while the dozer is an egg or
// spawning, so the lab is usually loaded by the time it steps out. It never
// waits for a boost that is not there.
@register
export class Bulldozer extends JobCreep {
    // From the spawns nearest home, one MOVE per WORK.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const close = closeSpawns(spawns, this.homeName) as StructureSpawn[];
        const spawn = _.find(close, s => !s.spawning) || _.first(close);
        if (!spawn) return [null, []];
        const energy = Math.min(spawn.room.energyAvailable, kMaxBodyEnergy);
        return [spawn, energyDef({ move: 1, per: [WORK], energy } as any)];
    }

    get homeName(): string {
        return this.mission.getRoomName("home")!;
    }

    get targets(): RoomPosition[] {
        const m = this.mission as unknown as DozerMission;
        return m.dozePositions ? m.dozePositions() : [];
    }

    // A home lab holding a boost for us, provided we still have a bare WORK part.
    boostLab(): StructureLab | null {
        const c = this.c;
        if (this.memory.noboost || this.pos.roomName !== this.homeName) return null;
        if (!_.any(c.body, p => p.type === WORK && !p.boost)) return null;
        c.room.requestBoost(kDozerBoost);
        return _.find(c.room.findStructs(STRUCTURE_LAB) as StructureLab[], l =>
            l.my && l.mineralType === kDozerBoost &&
            l.mineralAmount >= LAB_BOOST_MINERAL && l.store.energy >= LAB_BOOST_ENERGY) || null;
    }

    start(): Task2Ret {
        const lab = this.boostLab();
        if (lab) return this.boost(lab);

        const targets = this.targets;
        if (!targets.length) return "wait";

        // Already next to one: no walk to plan.
        const near = _.find(targets, t => this.pos.isNearTo(t) && dozeable(t).length);
        if (near) return this.doze(near.x * 100 + near.y, near.roomName);

        // doze's moveTarget to the same tile follows the planned walk unchanged.
        const i = rewalker.planWalk(this.c, targets.map(pos => ({ pos, range: 1 })));
        if (i < 0) {
            this.log("no walk to any of", targets.length, "targets:", i);
            return "wait";
        }
        const t = targets[i];
        return this.doze(t.x * 100 + t.y, t.roomName);
    }

    @task
    boost(lab: StructureLab): Task2Ret {
        const c = this.c;
        if (!this.boostLab()) return "start";
        if (!this.pos.isNearTo(lab)) return this.moveTarget(lab, 1);
        const err = lab.boostCreep(c);
        if (err !== OK) {
            this.log("boost at", lab, "failed", err);
            this.memory.noboost = true;
        }
        // The boost shows on the body next tick.
        return "wait";
    }

    @task
    doze(xy: number, roomName: string): Task2Ret {
        const pos = fromXY(xy, roomName);
        // Dropped from the list (cleared, or the mission changed its mind).
        if (!_.any(this.targets, t => t.isEqualTo(pos))) return "start";
        if (!this.pos.isNearTo(pos)) return this.movePos(pos, 1);
        const struct = _.first(dozeable(pos));
        if (!struct) return "start";
        const err = this.c.dismantle(struct);
        if (err !== OK) {
            this.log("dismantle", struct, "failed", err);
            return "start";
        }
        return "wait";
    }
}
