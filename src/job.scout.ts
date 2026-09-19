import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { defaultRewalker } from "Rewalker";

const rewalker = defaultRewalker();

@register
export class Scout extends JobCreep {
    // Cheap and unblocking: vision gates whole missions, so jump the 0-priority queue.
    priority = 7;
    spawn(spawns: StructureSpawn[]): [StructureSpawn|null, BodyPartConstant[]] {
        // A mission's designated spawn room is the only choice when it names one.
        const spawnName = this.mission.getRoomName("spawn");
        if (spawnName) return [_.sample(spawns.filter(s => s.room.name === spawnName)) || null, [MOVE]];
        // Prefer the mission's home room when it names one; otherwise any spawn.
        const homeName = this.mission.getRoomName("home");
        const homeSpawns = spawns.filter(s => s.room.name === homeName);
        return [_.sample(homeSpawns.length ? homeSpawns : spawns), [MOVE]];
    }

    start(): Task2Ret {
        this.dlog("heading to", this.mission.roomName);
        const ret = this.moveRoom(this.mission.roomName);
        if (ret !== "start") return ret;
        // Arrived. Keep drifting toward the middle of the room: parked near an
        // exit the scout gets bounced across the border and loses the vision
        // it was spawned for.
        return this.moveRoom(this.mission.roomName, 2525, 15);
    }
}