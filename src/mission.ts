import { Targetable, Tasker, MemoryTask } from "Tasker";
import { FlagExtra } from "flag";
import { injecter } from "roomobj";

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

@injecter(Flag)
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

class PowerMission extends MissionExtra {
    runPower() {

    }
}