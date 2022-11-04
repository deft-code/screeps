import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { defaultRewalker } from "Rewalker";

const rewalker = defaultRewalker();

@register
export class Scout extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn|null, BodyPartConstant[]] {
        return [_.sample(spawns), [MOVE]];
    }

    start(): Task2Ret {
        this.log("heading to", this.mission.roomName);
        return this.moveRoom(this.mission.roomName);
    }
}