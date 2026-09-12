import { Mission } from "mission";
import { register, Priority } from "process";
import { getRoleClass } from "mycreep";
import * as debug from "debug";

// Spawn exactly one creep of a job and shepherd it until it is gone.
//
//   scheduleService('Once Paver W27S9')   // args[1]=job class name, args[2]=mission room
//
// The egg is laid on the first run; once it has spawned (eggs and hatch
// empty, one creep) the mission winds down, which stops laying, shepherds the
// creep, and kills and deschedules the mission after the creep's tombstone is
// gone. Winding down earlier would purge the unhatched egg. Service.schedule
// is idempotent, so a scheduler may call it every tick while it sees work.
@register
export class Once extends Mission {
    get jobName() {
        return this.args[1];
    }

    get roomName() {
        return this.args[2];
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
        const alive = mem.eggs.length + mem.hatch.length + mem.creeps.length;
        if (!alive) {
            this.layEgg(role);
        } else if (mem.creeps.length && !mem.eggs.length && !mem.hatch.length) {
            this.windDown();
        }
        super.run();
        return "normal";
    }

    status(): string {
        return super.status() + ` job:${this.jobName}`;
    }
}
