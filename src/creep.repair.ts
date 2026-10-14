import { CreepBuild, buildRange } from "creep.build";
import { injecter } from "roomobj";
import { TaskRet } from "Tasker";

declare global {
    interface CreepMemory {
        repairid?: Id<Structure>
    }
    interface CreepTaskMem {
        max?: number
    }
}

export function repairable(struct: Structure): boolean {
    return struct.hits < struct.room.maxHits(struct);
}

// A repair task stops this far above where it started (and never above the
// room's maxHits), so the pick is made again before one rampart eats the
// whole budget while roads rot. Until Oct 2026 this was the only bound: a
// task ran to hits + 100k whatever maxHits said, and taskRepairOrdered
// always found the lowest rampart again, so ramparts climbed for ever
// (66M in W25S7 against a 20M max).
const kRepairChunk = 100000;
// Ramparts and walls read this much lower on the scale than they are, so
// they win ties and near-ties against roads and containers: a freshly
// raised rampart ceiling (an RCL up) gets its upkeep without the worker
// bouncing to every road first.
const kRampartBias = 0.1;
// A road is left alone until it has lost this many repair hits' worth
// (one tick of the creep's repair); a container until it has lost this much.
const kContainerHurts = 100000;

function rampartish(struct: Structure): boolean {
    return struct.structureType === STRUCTURE_RAMPART || struct.structureType === STRUCTURE_WALL;
}

// Roads, containers, ramparts and walls: what loses hits on its own (walls
// do not, but are kept with the ramparts).
function decaying(struct: Structure): boolean {
    return rampartish(struct) || struct.structureType === STRUCTURE_ROAD || struct.structureType === STRUCTURE_CONTAINER;
}

function shouldRepair(struct: Structure, repairPower: number): boolean {
    return repairable(struct) && (struct.hurts >= repairPower || struct.hitsMax < repairPower);
}

@injecter(Creep)
export class CreepRepair extends CreepBuild {
    idleRepairAny() {
        this.dlog('start idle repair, melee/range intents:', this.intents.melee, this.intents.range);
        if (this.intents.melee || this.intents.range) return false;
        let repair = this.memory.repairid ? Game.getObjectById<Structure>(this.memory.repairid) : null;
        this.dlog('idle repair', repair);
        if (!repair || !repair.hurts) {
            this.dlog('New idle repair target');
            const repairPower = this.info.repair;
            repair = _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 3, true))
                .map(spot => spot[LOOK_STRUCTURES])
                .find(struct => shouldRepair(struct, repairPower)) || null;
            this.dlog('repair found', repair);
            this.memory.repairid = repair?.id;
        }
        const what = this.goRepair(repair!, false);
        this.dlog('idleRepair', what, repair);
        if (!what) {
            delete this.memory.repairid;
        }
        return what;
    }

    taskRepairHurt() {
        return this.taskRepairStructs(this.room.find(FIND_STRUCTURES));
    }

    // The room's upkeep, one task at a time (Worker, Mason, Farmer, Cart,
    // Bootstrap): first the most damaged of our own structures that only
    // lose hits to attack (a spawn, extension, tower, ...: lowest hits /
    // hitsMax), then the most damaged of the decaying structures
    // (repairScale: lowest hits / maxHits first, ramparts and walls read
    // kRampartBias lower), one kRepairChunk at a time. Nothing at or over
    // its maxHits is touched.
    taskRepairOrdered() {
        const pick = this.repairPick(this.room.find(FIND_STRUCTURES));
        return pick ? this.taskRepair(pick) : false;
    }

    // Where `struct` stands on the repair scale: hits / maxHits, ramparts
    // and walls kRampartBias lower; Infinity for what is not to be
    // repaired now (at or over its max, no max, a road or container still
    // above its wear threshold, or not a decaying type).
    repairScale(struct: Structure): number {
        if (!decaying(struct)) return Infinity;
        const max = this.room.maxHits(struct);
        if (max <= 0 || struct.hits >= max) return Infinity;
        if (struct.structureType === STRUCTURE_ROAD && struct.hurts < this.info.repair) return Infinity;
        if (struct.structureType === STRUCTURE_CONTAINER && struct.hurts <= kContainerHurts) return Infinity;
        const scale = struct.hits / max;
        return rampartish(struct) ? scale - kRampartBias : scale;
    }

    // What to repair next: the most damaged hurt structure of ours that
    // does not decay (lowest hits / hitsMax; foreign ones, an invader core
    // or another player's leftovers, are never ours to mend), else the
    // decaying structure lowest on the repair scale, else null. One pass,
    // shuffled so ties rotate.
    repairPick(structs: Structure[]): Structure | null {
        let hurt: Structure | null = null;
        let hurtScale = Infinity;
        let best: Structure | null = null;
        let bestScale = Infinity;
        for (const struct of _.shuffle(structs)) {
            if (!decaying(struct)) {
                if (!(struct as OwnedStructure).my || !(struct.hurts > 0)) continue;
                const scale = struct.hits / struct.hitsMax;
                if (scale < hurtScale) {
                    hurtScale = scale;
                    hurt = struct;
                }
                continue;
            }
            if (hurt) continue;
            const scale = this.repairScale(struct);
            if (scale < bestScale) {
                bestScale = scale;
                best = struct;
            }
        }
        return hurt || best;
    }

    // Repair whichever of `structs` needs it, in no particular order: the
    // hurt non-decaying ones, the decaying ones under their maxHits (a
    // road past its wear threshold, a container past kContainerHurts).
    // Bootstrap's taskRepairHurt and creep.oldrepair use it; Worker and the
    // others go through taskRepairOrdered.
    taskRepairStructs(structs: Structure[]) {
        for (const struct of _.shuffle(structs)) {
            if (decaying(struct) ? this.repairScale(struct) < Infinity : (struct as OwnedStructure).my && struct.hurts > 0) {
                return this.taskRepair(struct);
            }
        }
        return false;
    }

    // Repair `struct` up to `max`: by default kRepairChunk above where it
    // started, never past the room's maxHits for a decaying structure
    // (hitsMax for the rest: they only lose hits to attack and are made
    // whole, whatever a retired tile's meta says). The bound is kept in the
    // task's memory, so it holds across ticks and the pick is made again
    // once it is reached.
    taskRepair(struct: Structure | null, max?: number) {
        struct = this.checkId<Structure>('repair', struct)
        if (!struct) return false
        if (!struct.hurts) return false
        if (!max) {
            max = this.memory.task!.max;
            if (!max) {
                const cap = decaying(struct) ? this.room.maxHits(struct) || struct.hitsMax : struct.hitsMax;
                max = this.memory.task!.max = Math.min(cap, struct.hits + kRepairChunk);
            }
        }
        if (struct.hits >= max) return false;
        return this.goRepair(struct)
    }

    idleRepair(struct: Structure): TaskRet {
        return this.goRepair(struct, false);
    }

    goRepair(struct: Structure | null, move = true): TaskRet {
        if (!struct) return false;
        const err = this.repair(struct);
        this.dlog(`gorepair ${err}`);
        let ret: TaskRet = false;
        if (err === OK) {
            this.intents.melee = this.intents.range = struct;
            ret = 'repaired';
        }
        // Same edge rule as goBuild: repair from closer in near exits so the
        // creep never settles on an exit tile.
        const range = buildRange(struct.pos);
        if (move && (err === ERR_NOT_IN_RANGE || !this.pos.inRangeTo(struct, range))) {
            return this.moveRange(struct, { range });
        }
        return ret;
    }
}