import { CreepBuild } from "creep.build";
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

export function dynMaxHits(struct: Structure): number {
    switch (struct.structureType) {
        case STRUCTURE_WALL:
        case STRUCTURE_RAMPART:
        case STRUCTURE_ROAD:
        case STRUCTURE_CONTAINER:
            return struct.room.maxHits(struct);
    }
    return struct.hitsMax;
}

export function repairable(struct: Structure): boolean {
    return struct.hits < dynMaxHits(struct);
}

function shouldRepair(struct: Structure, repairPower: number): boolean {
    return repairable(struct) && (struct.hurts >= repairPower || struct.hitsMax < repairPower);
}

@injecter(Creep)
export class CreepRepair extends CreepBuild {
    idleRepairAny() {
        this.dlog('start idle repair, melee/range intents:', this.intents.melee, this.intents.range);
        if (this.intents.melee || this.intents.range) return false;
        let repair = Game.getObjectById(this.memory.repairid);
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

    taskRepairOrdered() {
        const decay = this.room.findStructs(
            STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART);

        return this.taskRepairStructs(decay) ||
            this.taskRepairStructs(this.room.find(FIND_STRUCTURES));
    }

    taskRepairStructs(structs: Structure[]) {
        const shuffled = _.shuffle(structs);
        for (let struct of shuffled) {
            switch (struct.structureType) {
                case STRUCTURE_RAMPART:
                case STRUCTURE_WALL:
                    if (struct.hits < (0.9 * this.room.maxHits(struct))) {
                        return this.taskRepair(struct);
                    }
                    break;
                case STRUCTURE_CONTAINER:
                    if (struct.hurts > 100000 && struct.hits < this.room.maxHits(struct)) {
                        return this.taskRepair(struct);
                    }
                    break;
                case STRUCTURE_ROAD:
                    if (struct.hurts >= this.info.repair && struct.hits < this.room.maxHits(struct)) {
                        return this.taskRepair(struct);
                    }
                    break;
                default:
                    if (struct.hurts > 0) {
                        return this.taskRepair(struct);
                    }
                    break;
            }
        }
        return false;
    }

    taskRepair(struct: Structure | null, max?: number) {
        struct = this.checkId<Structure>('repair', struct)
        if (!struct) return false
        if (!struct.hurts) return false
        if (!max) {
            max = this.memory.task!.max;
            if (!max) {
                max = this.memory.task!.max = struct.hits + 10000;
            }
        }
        if (struct.hits > max) return false;
        return this.goRepair(struct)
    }

    idleRepair(struct: Structure): TaskRet {
        return this.goRepair(struct, false);
    }

    goRepair(struct: Structure, move = true): TaskRet {
        const err = this.repair(struct);
        this.dlog(`gorepair ${err}`);
        if (err === OK) {
            this.intents.melee = this.intents.range = struct;
            return 'repaired';
        }
        if (move && err === ERR_NOT_IN_RANGE) {
            return this.moveRange(struct);
        }
        return false;
    }
}