import { Mission } from "mission";
import { register, Priority } from "process";
import { Pioneer } from "job.pioneer";
import { Scout } from "job.scout";
import { Claimer } from "job.claimer";
import { Guard } from "job.guard";
import * as debug from "debug";

// RCL at which the assisted room is on its own and the mission winds down.
const kDoneRCL = 4;
// Pioneers per creep lifetime while the room is ours and below kDoneRCL.
const kPioneers = 2;
// Ticks between "not ours" log lines while waiting for the room.
const kLogPace = 100;

// Boost a freshly claimed room with startup creeps spawned elsewhere.
//
//   scheduleService('Startup W5N8')   // args[1]=room to assist
//
// Without vision of the room one Scout (job.scout.ts) parks there. While the
// room's controller is not ours and GCL allows another room, one Claimer
// (job.claimer.ts) claims it. While it is ours and below RCL4, paces Pioneers
// (job.pioneer.ts) at kPioneers (2) per lifetime (paceNJobs), spawned by the
// nearest spawns outside the room ("remote" strategy) and homed on the room,
// plus nJobs(Guard, 1) until the room has a tower.
// At RCL4 the mission winds down: no more eggs, the
// living pioneers work until they die, then the mission kills and
// deschedules itself.
@register
export class Startup extends Mission {
    get roomName(): string {
        return this.args[1];
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const room = this.room;
        const controller = room?.controller;
        if (!room) {
            this.nJobs(Scout, 1);
        } else if (!controller) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: room has no controller");
        } else if (!controller.my) {
            this.claim();
        } else if (controller.level >= kDoneRCL) {
            debug.log(this.name, "reached RCL", controller.level);
            this.windDown();
        } else {
            this.paceNJobs(Pioneer, kPioneers);
            if (!room.findStructs(STRUCTURE_TOWER).length) this.nJobs(Guard, 1);
        }

        super.run();
        return "normal";
    }

    // One claimer alive at a time (nJobs with the CLAIM lifetime), only while
    // GCL has room for another controller. A controller someone else owns is
    // attacked by the claimer, as role.claimer.js did.
    claim() {
        const owned = _.filter(Game.rooms, r => r.controller?.my).length;
        if (owned >= Game.gcl.level) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: GCL", Game.gcl.level, "owns", owned);
            return null;
        }
        return this.nJobs(Claimer, 1, CREEP_CLAIM_LIFE_TIME);
    }

    status(): string {
        const lvl = this.room?.controller?.level;
        return super.status() + ` rcl:${lvl === undefined ? "?" : lvl}/${kDoneRCL}`;
    }
}
