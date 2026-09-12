import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { defaultRewalker } from "Rewalker";

const rewalker = defaultRewalker();

@register
export class Scout extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn|null, BodyPartConstant[]] {
        // Prefer the mission's home room when it names one; otherwise any spawn.
        const homeName = this.mission.getRoomName("home");
        const homeSpawns = spawns.filter(s => s.room.name === homeName);
        return [_.sample(homeSpawns.length ? homeSpawns : spawns), [MOVE]];
    }

    start(): Task2Ret {
        this.log("heading to", this.mission.roomName);
        return this.moveRoom(this.mission.roomName);
    }
}