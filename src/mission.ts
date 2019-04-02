import { Targetable, Tasker, MemoryTask } from "Tasker";
import { merge } from "lib";
import { FlagExtra } from "flag";

declare global {
    interface FlagMemory {
        task?: MemoryTask
    }
    interface Flag {
        runMission(): void
    }
}

const missionTasker = new Tasker();

class MissionExtra extends FlagExtra {
    get role() {
        return this.teamWhat();
    }

    task<T extends Targetable>(target: T | string | null | undefined, ...args: (string | number)[]): T | null {
        return missionTasker.task(this, 4, target, ...args);
    }

    taskNull(...args: (string | number)[]) {
        return missionTasker.taskNull(this, 4, ...args);
    }

    runMission() {
        missionTasker.looper(this);
    }

    taskDupe() {
        if (this.quantity() < 1) {
            for (let i = 1; i < 100; i++) {
                const next: string = this.name + 1
                const err = this.pos.createFlag(next, this.color, this.secondaryColor);
                if (err === ERR_NAME_EXISTS) continue;
                this.errlog(err);
                this.remove();
                return false;
            }
            this.log("no dupes available", this.quantity());
        }
        return false;
    }
}

merge(Flag, MissionExtra);

class PowerMission extends MissionExtra {
    runPower() {

    }
}