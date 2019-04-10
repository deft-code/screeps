import { Targetable, Tasker, MemoryTask } from "Tasker";
import { merge } from "lib";
import { FlagExtra } from "flag";

declare global {
    interface FlagMemory {
        task?: MemoryTask
    }
    interface Flag {
        runMission(): void
        role: string
    }
}


const missionTasker = new Tasker();

class MissionExtra extends FlagExtra {
    task<T extends Targetable>(target: T | string | null | undefined, ...args: (string | number)[]): T | null {
        return missionTasker.task(this, 4, target, ...args);
    }

    taskNull(...args: (string | number)[]) {
        return missionTasker.taskNull(this, 4, ...args);
    }

    runMission() {
        missionTasker.looper(this);
    }
}

merge(Flag, MissionExtra);

class PowerMission extends MissionExtra {
    runPower() {

    }
}