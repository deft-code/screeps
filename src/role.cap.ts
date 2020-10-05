import { injecter } from "roomobj";
import { CreepCarry } from "creep.carry";
import { fromXY } from "Rewalker";
import { TaskRet } from "Tasker";
import { isSType } from "guards";

declare global {
    interface CreepCache {
        job?: Generator
        pos?: RoomPosition
    }
}

@injecter(Creep)
export class CapRole extends CreepCarry {
    roleCap() {
        const what = this.taskTask();
        if (what) return what;

        if (!this.cache.pos) {
            this.cache.pos = this.room.meta.getMeta('cap')?.pos;
            if (!this.cache.pos) {
                this.say("BROKEN");
                return false;
            }
        }

        const looks = this.room.lookForAtRange(LOOK_STRUCTURES, this.cache.pos, 3, true);
        const extns = [];
        for (const look of looks) {
            const struct = look[LOOK_STRUCTURES];
            if (isSType(struct, STRUCTURE_EXTENSION) && struct.store.getFreeCapacity(RESOURCE_ENERGY) && !struct.tick.transfer) {
                extns.push(struct);
            }
        }
        return this.taskExtnFill(this.pos.findClosestByRange(extns)) || this.moveSpot();
    }

    afterCap() {
        this.idleRecharge();
        this.idleTransferExtn();
    }
}