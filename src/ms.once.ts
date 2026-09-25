import { Mission } from "mission";
import { register, Priority } from "process";
import { getRoleClass } from "mycreep";
import * as debug from "debug";

// Spawn a job's creep a set number of times, one at a time, and shepherd
// each until it is gone.
//
//   scheduleService('Once Scout W27S9')     // args[1]=job class name, args[2]=mission room
//   scheduleService('Once Toxic W25S5 3')   // optional args[3]=how many in turn (default 1)
//
// An egg is laid whenever nothing of the job is alive (egg, hatchling or
// creep) and fewer than count have been laid (memory.laid). Once the last one
// has spawned (eggs and hatch empty, one creep) the mission winds down, which
// stops laying, shepherds the creep, and kills and deschedules the mission
// after the creep's tombstone is gone. Winding down earlier would purge the
// unhatched egg. Service.schedule is idempotent, so a scheduler may call it
// every tick while it sees work.
interface OnceMemory {
    laid?: number
}

@register
export class Once extends Mission {
    get jobName() {
        return this.args[1];
    }

    get roomName() {
        return this.args[2];
    }

    get count(): number {
        return Math.max(1, Number(this.args[3]) || 1);
    }

    get omem(): OnceMemory {
        return this.memory as unknown as OnceMemory;
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const role = this.jobName.toLowerCase();
        if (!getRoleClass(role)) {
            debug.log(this.name, "unknown job", this.jobName, "- killing");
            this.kill();
            return "kill";
        }

        const mem = this.memory;
        const omem = this.omem;
        const alive = mem.eggs.length + mem.hatch.length + mem.creeps.length;
        // Missions from before the count existed: whatever is alive was laid.
        if (omem.laid === undefined) omem.laid = alive ? 1 : 0;
        if (!alive && omem.laid < this.count) {
            this.layEgg(role);
            omem.laid++;
        } else if (omem.laid >= this.count && mem.creeps.length && !mem.eggs.length && !mem.hatch.length) {
            this.windDown();
        }
        super.run();
        return "normal";
    }

    status(): string {
        return super.status() + ` job:${this.jobName} laid:${this.omem.laid || 0}/${this.count}`;
    }
}
