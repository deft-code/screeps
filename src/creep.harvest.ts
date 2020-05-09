import { CreepCarry } from "creep.carry";
import { injecter } from "roomobj";
import { TaskRet } from "Tasker";

@injecter(Creep)
export class CreepHarvest extends CreepCarry {
    goHarvest(src: Source, move = true): TaskRet {
        const err = this.harvest(src);
        this.dlog(`goharvest ${err}`);
        if (err === OK) {
            this.intents.melee = this.intents.range = src;
            return 'harvesting';
        }
        if (move && err === ERR_NOT_IN_RANGE) {
            return this.moveNear(src);
        }
        return false;
    }
}