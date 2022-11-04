import { Mission } from "mission";
import { MyCreep, Task2Ret } from "mycreep";
import { Service } from "process";
import { defaultRewalker, fromXY } from "Rewalker";

interface HasPos {
    pos: RoomPosition
}

const rewalker = defaultRewalker();

export class JobCreep extends MyCreep {
    get mission(): Mission {
        return Service.getType<Mission>(this.memory.mission)!; 
    }
    eggRun() {}

    moveRoom(roomName: string = "", xy = 2525, range = 20): Task2Ret {
        return this.movePos(fromXY(xy, roomName || this.mission.roomName), range);
    }

    moveTargetRoom(target: HasPos | null): Task2Ret {
        if (!target) return "start";
        const x = this.pos.x;
        const y = this.pos.y;
        if (target.pos.roomName === this.pos.roomName) {
            if (x === 0) {
                this.moveDir(RIGHT);
            } else if (x === 49) {
                this.moveDir(LEFT);
            } else if (y === 0) {
                this.moveDir(BOTTOM);
            } else if (y === 49) {
                this.moveDir(TOP);
            }
            this.dlog('moveRoom done');
            return "start";
        }

        const ox = target.pos.x;
        const oy = target.pos.y;
        const range = Math.max(1, Math.min(ox, oy, 49 - ox, 49 - oy) - 1);
        return this.moveTarget(target, range);
    }

    moveDir(dir: DirectionConstant): Task2Ret {
        const ret = this.c.move(dir);
        if (ret === ERR_BUSY || ret === ERR_TIRED) {
            return "wait";
        }
        if (ret === OK) {
            return "wait";
        }
        return "start";
    }


    moveTarget(obj: HasPos, range: number): Task2Ret {
        return this.movePos(obj.pos, range);
    }

    movePos(pos: RoomPosition, range: number): Task2Ret {
        const ret = rewalker.walkTo(this.c, pos, range);
        if (ret === OK) return "start";
        return "wait";
    }

    walkRange(target: HasPos) {
        return rewalker.walkTo(this.c, target.pos, 3);
    }

}