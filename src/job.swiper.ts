import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { defaultRewalker, fromXY } from "Rewalker";
import { TaskRet } from "Tasker";

const rewalker = defaultRewalker();

interface HasPos {
    pos: RoomPosition
}

@register
export class Swiper extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return [_.sample(spawns), [MOVE, CARRY]];
    }

    start(): Task2Ret {
        if (this.c.store.getFreeCapacity() < this.c.store.getUsedCapacity()) {
            if(!this.mission.home) {
                return this.moveRoom(this.mission.homeName);
            }
            return this.dropRange(this.mission.home.controller!);
        }

        if(!this.mission.atRoom()){
            if(!this.mission.getRoom()) {
                return this.moveRoom();
            }
        }


        




        if(!this.mission.room) {
            return this.moveRoom();
        }
        return this.moveRoom(this.mission.roomName);
    }

    @task
    dropRange(struct: Structure): Task2Ret {
        if(this.c.store.getUsedCapacity() === 0){
            this.log("Unexpectedly Empty!");
            return "start";
        }
        if(this.walkRange(struct) === OK) {
            this.c.drop("energy");
            return "wait";
        }
    }



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