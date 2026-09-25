import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import { Worker } from "job.worker";
import { Ctrl } from "job.ctrl";
import { Hub as HubJob } from "job.hub";
import { Reboot } from "job.reboot";
import { Upgrader } from "job.upgrader";
import { CtrlHauler } from "job.ctrlhauler";
import { Chemist } from "job.chemist";
import { defaultRewalker, toXY } from "Rewalker";
import * as debug from "debug";

// Ticks between "waiting" log lines while the room is not ours or has no spawn.
const kLogPace = 100;

// Hauler scaling by energy lying on the floor: one hauler up to
// kEnergyTolerance dropped energy, one more per kHaulerScale above it, never
// more than kMaxHaulers.
const kEnergyTolerance = 1000;
const kHaulerScale = 2000;
const kMaxHaulers = 3;

// A srcer is replaced this many ticks before its predecessor dies on top of
// the walk from the spawn to its spot: spawning plus slack.
const kSrcerLead = 30;
// Ticks a cached spawn -> src spot walk stays good; roads and spawns change.
const kSrcDistPace = 5000;

interface SrcDist {
    xy: number   // the meta spot the walk was measured to
    dist: number // steps from the nearest spawn
    at: number   // Game.time measured
}

interface HubMemory extends MissionMemory {
    // role (asrc/bsrc) -> Rewalker-costed walk from the nearest spawn.
    srcDist?: { [role: string]: SrcDist }
}

// Run an owned room's economy from its own spawns: GlobalRespawn without the
// startup creeps.
//
//   scheduleService('Hub W25S7')   // args[1]=owned room
//
// Every tick, as GlobalRespawn does for Game.spawns.Home's room: one Reboot
// (job.reboot.ts) while the mission has no creeps at all; once energyCapacity
// reaches 550 one bsrc (only if a Meta_bsrc is planned) then one asrc
// (job.srcer.ts; they need the room's Meta_bsrc/Meta_asrc), each counted as
// 1 + (walk from spawn + 30) / 1500 so the replacement arrives as the old
// one dies; otherwise nHaulers() haulers (1 + one per
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

    get memory(): HubMemory {
        return super.memory as HubMemory;
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

        // A bsrc only where a Meta_bsrc is planned: single-source rooms have none.
        const bsrc = !!room.meta.getMeta('bsrc');
        ecap >= 550 && ((bsrc && this.nCreeps('bsrc', this.nSrcers(room, 'bsrc'))) ||
            this.nCreeps('asrc', this.nSrcers(room, 'asrc'))) ||
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

    // One srcer, plus the fraction of a lifetime its replacement needs to
    // walk to the spot, so the next one arrives as the last one dies.
    nSrcers(room: Room, role: string): number {
        const dist = this.srcDist(room, role);
        return 1 + (dist + kSrcerLead) / CREEP_LIFE_TIME;
    }

    // Steps from the room's nearest spawn to the role's meta spot as
    // Rewalker.planRoad walks them (a srcer keeps full speed on roads only),
    // cached in memory.srcDist until the spot moves or kSrcDistPace ticks
    // pass. 0 without a spot or a spawn.
    srcDist(room: Room, role: string): number {
        const spot = room.meta.getSpot(role);
        if (!spot) return 0;
        const xy = toXY(spot);
        const cache = this.memory.srcDist = this.memory.srcDist || {};
        const old = cache[role];
        if (old && old.xy === xy && old.at + kSrcDistPace > Game.time) return old.dist;

        const spawns = room.findStructs(STRUCTURE_SPAWN);
        if (!spawns.length) return 0;
        const ret = defaultRewalker().planRoad(spot, spawns.map(s => ({ pos: s.pos, range: 1 })));
        const dist = ret.path.length;
        if (ret.incomplete) debug.log(this.name, "srcDist incomplete", role, spot, "steps", dist);
        cache[role] = { xy, dist, at: Game.time };
        debug.log(this.name, "srcDist", role, spot, "steps", dist);
        return dist;
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
