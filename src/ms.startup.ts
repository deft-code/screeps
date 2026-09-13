import { Mission } from "mission";
import { register, Priority } from "process";
import { Pioneer } from "job.pioneer";
import * as debug from "debug";

// RCL at which the assisted room is on its own and the mission winds down.
const kDoneRCL = 4;
// Ticks between "not ours" log lines while waiting for the room.
const kLogPace = 100;

// Boost a freshly claimed room with startup creeps spawned elsewhere.
//
//   scheduleService('Startup W5N8')   // args[1]=room to assist
//
// While the room's controller is ours and below RCL4, keeps
// max(1, 6 - rcl) Pioneers (job.pioneer.ts) alive: the GlobalRespawn startup
// count, spawned by the nearest spawns outside the room ("remote" strategy)
// and homed on the room. At RCL4 the mission winds down: no more eggs, the
// living pioneers work until they die, then the mission kills and
// deschedules itself. A room that is not (or no longer) ours lays nothing.
@register
export class Startup extends Mission {
    get roomName(): string {
        return this.args[1];
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const room = this.room;
        const controller = room?.controller;
        if (!room || !controller || !controller.my) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: room is not ours");
        } else if (controller.level >= kDoneRCL) {
            debug.log(this.name, "reached RCL", controller.level);
            this.windDown();
        } else {
            this.nJobs(Pioneer, Math.max(1, 6 - controller.level));
        }

        super.run();
        return "normal";
    }

    status(): string {
        const lvl = this.room?.controller?.level;
        return super.status() + ` rcl:${lvl === undefined ? "?" : lvl}/${kDoneRCL}`;
    }
}
