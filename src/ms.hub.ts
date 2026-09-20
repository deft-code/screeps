import { Mission } from "mission";
import { register, Priority } from "process";
import { Worker } from "job.worker";
import { Ctrl } from "job.ctrl";
import { Hub as HubJob } from "job.hub";
import { Reboot } from "job.reboot";
import { Upgrader } from "job.upgrader";
import { CtrlHauler } from "job.ctrlhauler";
import { Chemist } from "job.chemist";
import * as debug from "debug";

// Ticks between "waiting" log lines while the room is not ours or has no spawn.
const kLogPace = 100;

// Hauler scaling by energy lying on the floor: one hauler up to
// kEnergyTolerance dropped energy, one more per kHaulerScale above it, never
// more than kMaxHaulers.
const kEnergyTolerance = 1000;
const kHaulerScale = 2000;
const kMaxHaulers = 3;

// Run an owned room's economy from its own spawns: GlobalRespawn without the
// startup creeps.
//
//   scheduleService('Hub W25S7')   // args[1]=owned room
//
// Every tick, as GlobalRespawn does for Game.spawns.Home's room: one Reboot
// (job.reboot.ts) while the mission has no creeps at all; once energyCapacity
// reaches 550 one bsrc then one asrc (job.srcer.ts; they need the room's
// Meta_bsrc/Meta_asrc), otherwise nHaulers() haulers (1 + one per
// kHaulerScale of dropped energy over kEnergyTolerance, max kMaxHaulers);
// one Worker; one Ctrl; one
// Hub once the room has storage (Hub.spawn also waits for the 'hub' spot);
// and one Chemist (job.chemist.ts) while the room has a terminal and a lab.
// Everything spawns "local", and nothing is laid until the room has a spawn
// of its own: until then the Startup mission's pioneers (spawned elsewhere,
// homed here) carry the room; both can run until Startup winds down at RCL4.
@register
export class Hub extends Mission {
    get roomName(): string {
        return this.args[1];
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const room = this.room;
        if (!room?.controller?.my) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: room is not ours");
            super.run();
            return "normal";
        }
        // "local" falls back to the nearest room with a spawn, so without one
        // of its own the room would draw oversized creeps from a neighbour.
        // Startup's pioneers carry it until the first spawn stands. Living
        // creeps still run, so a room that loses its spawn keeps its crew.
        if (!room.findStructs(STRUCTURE_SPAWN).length) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: room has no spawn");
            super.run();
            return "normal";
        }
        const ecap = room.energyCapacityAvailable;

        if (!this.creeps.length) {
            this.nJobs(Reboot, 1);
        }

        ecap >= 550 && (this.nCreeps('bsrc', 1) || this.nCreeps('asrc', 1)) ||
            this.nCreeps('hauler', this.nHaulers(room));

        this.nJobs(Worker, 1);
        this.nJobs(Ctrl, 1);

        room.storage && this.nJobs(HubJob, 1);
        this.nJobs(Upgrader, Upgrader.want(room));
        this.nJobs(CtrlHauler, CtrlHauler.want(this));
        this.nJobs(Chemist, Chemist.want(room));

        super.run();
        return "critical";
    }

    // Energy lying on the floor of the room.
    droppedEnergy(room: Room): number {
        return _.sum(room.find(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === RESOURCE_ENERGY,
        }), r => r.amount);
    }

    nHaulers(room: Room): number {
        const extra = Math.floor(Math.max(0, this.droppedEnergy(room) - kEnergyTolerance) / kHaulerScale);
        return Math.min(kMaxHaulers, 1 + extra);
    }

    status(): string {
        const room = this.room;
        const lvl = room?.controller?.level;
        if (room?.controller?.my && !room.findStructs(STRUCTURE_SPAWN).length) {
            return super.status() + ` rcl:${lvl} no-spawn`;
        }
        const haul = room ? ` dropped:${this.droppedEnergy(room)} haulers:${this.nHaulers(room)}` : "";
        return super.status() + ` rcl:${lvl === undefined ? "?" : lvl}` + haul;
    }
}
