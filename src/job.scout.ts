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
        const dest = new RoomPosition(25,25, "W5N5");
        rewalker.walkTo(this.c, dest, 20);
       return "wait";
    }
}