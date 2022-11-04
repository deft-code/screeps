import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { defaultRewalker, fromXY } from "Rewalker";

const rewalker = defaultRewalker();

interface HasPos {
    pos: RoomPosition
}

@register
export class Swiper extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return [_.sample(spawns), [MOVE, CARRY]];
    }

    get home() {
        return this.mission.getRoom("home");
    }

    see(roomAlias:string): Task2Ret | false {
        const room = this.mission.getRoom(roomAlias);
        if(!room) {
            return this.moveRoom(this.mission.getRoomName(roomAlias)!);
        }
        return false;
    }

    at(roomAlias: string) {
        this.pos.roomName === this.mission.getRoomName(roomAlias);
    }
    

    start(): Task2Ret {
        if (this.c.store.getFreeCapacity() < this.c.store.getUsedCapacity()) {
            return this.see(this.mission.getRoomName("home")!) || this.dropRange(this.home!.controller!);
        }

        return this.see(this.mission.getRoomName()!) || this.moveRoom(this.mission.getRoomName()!);
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
        return "wait";
    }
}