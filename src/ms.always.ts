import { Mission } from "mission";
import { register, Priority } from "process";
import { getRoleClass } from "mycreep";
import * as debug from "debug";

// Keep a job's creep in a room for good: Once (ms.once.ts) that never winds
// down. One egg per creep lifetime (paceNJobs count 1, so a creep that dies
// early is not replaced before its time), never while one is unhatched.
//
//   scheduleService('Always Mini W28S4')     // args[1]=job class name, args[2]=mission room
//   scheduleService('Always Mini W28S4 2')   // optional args[3]=creeps per lifetime (default 1)
//
// Stop it with windDown() (the living creep finishes its life) or kill().
@register
export class Always extends Mission {
    get jobName() {
        return this.args[1];
    }

    get roomName() {
        return this.args[2];
    }

    get perLife(): number {
        return Math.max(1, Number(this.args[3]) || 1);
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const ctor = getRoleClass(this.jobName.toLowerCase());
        if (!ctor) {
            debug.log(this.name, "unknown job", this.jobName, "- killing");
            this.kill();
            return "kill";
        }
        this.paceNJobs(ctor, this.perLife);
        super.run();
        return "normal";
    }

    status(): string {
        return super.status() + ` job:${this.jobName} perLife:${this.perLife}`;
    }
}
