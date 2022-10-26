import { MyCreep, task, Task2Ret } from "mycreep";

export class Scout extends MyCreep {
    static spawn(spawns: StructureSpawn[]): [StructureSpawn|null, BodyPartConstant[]] {
        return [_.sample(spawns), [MOVE]];
    }

    start(): Task2Ret {
       return "wait";
       // return this.walkToRoom(this.mission.targetRoom(this))
    }

    walkToRoom(room: Room | string): Task2Ret {
        if(_.isString(room)) return this.walkToRoomName(room);
        return this.walkToRoomName(room.name);
    }

    @task
    walkToRoomName(roomName: string): Task2Ret {
        return "wait";
    }
}