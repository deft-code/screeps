import { Mission } from "mission";
import { register, Priority } from "process";
import { Farmer } from "job.farmer";
import { Scout } from "job.scout";
import { Wolf } from "job.wolf";
import { Guard } from "job.guard";
import { Mini } from "job.mini";
import { Reserver } from "job.reserver";
import { whoami } from "Rewalker";
import { getSpots } from "spots";
import * as debug from "debug";

// A CLAIM creep lives 600 ticks; leave 50 for the walk to the controller.
const kReserverLife = CREEP_CLAIM_LIFE_TIME - 50;

// team.ts suppressGuard / suppressWolf: armed hostiles must have been seen in
// the room for this many consecutive ticks (strat.ts ratchet,
// memory.thostiles) before a guard, then a wolf, is sent. A brief visit is
// left to the towers at home; a stay earns a guard, a camp the heavier wolf.
const kMicroEnemyTicks = 5;
const kMiniHostileTicks = 10;
const kGuardHostileTicks = 100;
const kWolfHostileTicks = 300;
// Both cadences shrink by one tick per tick of hostile presence, from 1500
// down to this floor.
const kSuppressPace = CREEP_LIFE_TIME;
const kSuppressMinPace = 350;
// team.ts suppressMini: one cheap mini per this many ticks while any enemy
// creep (armed or not) has been seen in the room (memory.tenemies).
const kMiniPace = CREEP_LIFE_TIME;
// Ticks between "waiting" log lines while the home room is not ready.
const kLogPace = 100;

// Schedule from the console:
//   scheduleService('Farm W5N8 W6N8')        // args[1]=farm room, args[2]=home room
//   scheduleService('Farm W5N8 W6N8 W7N8')   // optional args[3]=the only room its creeps spawn from
@register
export class Farm extends Mission {
    get roomName() {
        return this.args[1];
    }

    // "spawn" is read by JobRole.stratSpawn and Scout.spawn: when set, the
    // mission's creeps come from that room's spawns and nowhere else, waiting
    // while they are busy. null leaves each job its usual spawn strategy.
    getRoomName(alias = "") {
        if (alias === "home") return this.args[2];
        if (alias === "spawn") return this.args[3] || null;
        return super.getRoomName(alias);
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        // The farmers unload in the home (drop) room and need something there
        // to spend the energy on: idle, laying nothing, until it has a spawn
        // or a spawn site. Living creeps still run.
        if (!this.homeReady()) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: home room has no spawn or spawn site");
            super.run();
            return "normal";
        }

        // Eggs for a designated spawn room with no spawn would never hatch.
        if (!this.spawnReady()) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: spawn room has no spawn");
            super.run();
            return "normal";
        }

        if (!this.room) {
            // No visibility: a scout keeps intel flowing until a farmer arrives.
            this.nJobs(Scout, 1);
        } else {
            // All may lay an egg in the same tick, in team.ts teamFarm order:
            // a mini for any enemy, a guard then a wolf for armed hostiles, a
            // wolf for the core (sharing the wolf pace), and a reserver to
            // contest a foreign reservation.
            this.suppressMini();
            this.suppressGuard();
            this.suppressWolf();
            this.suppressInvaderCore();
            this.reserve();
        }
        if (!this.foreignReserved()) {
            // nFarmers is a count per tfarmer lifetime; paceJobs wants ticks per egg.
            const n = this.nFarmers();
            this.paceNJobs(Farmer, n);
        }
        super.run();
        return "normal";
    }

    // The home room is ours and has a spawn or a spawn construction site. An
    // invisible home room is not ready.
    homeReady(): boolean {
        const home = Game.rooms[this.getRoomName("home") || ""] as Room | undefined;
        if (!home?.controller?.my) return false;
        if (home.findStructs(STRUCTURE_SPAWN).length) return true;
        return _.any(home.find(FIND_MY_CONSTRUCTION_SITES), s => s.structureType === STRUCTURE_SPAWN);
    }

    // No designated spawn room, or one that has a spawn of ours.
    spawnReady(): boolean {
        const name = this.getRoomName("spawn");
        if (!name) return true;
        return _.any(Game.spawns, s => s.room.name === name);
    }

    status(): string {
        if (this.windingDown) return super.status();
        return super.status() +
            (this.homeReady() ? "" : " home-not-ready") +
            (this.spawnReady() ? "" : " spawn-not-ready");
    }

    // Enough farmers to carry away everything the sources regenerate.
    nFarmers(): number {
        const room = this.room;
        // Without visibility we only know we need someone there, so ask for one.
        if (!room) return 1;

        const sources = room.find(FIND_SOURCES);
        if (!sources.length) return 0;

        // Two farmers per harvest spot is the most that can usefully be there.
        const nspots = _.sum(sources, src => getSpots(src.pos).length);
        const max = nspots * 2;

        const farmers = this.roleCreeps("farmer");
        if (!farmers.length) return max;

        // A farmer is assumed to make two full trips per source refresh cycle
        // (ENERGY_REGEN_TIME ticks), so each one drains twice its capacity.
        const avgCapacity = _.sum(farmers, c => c.c?.store.getCapacity() || 0) / farmers.length;
        const farmerRate = avgCapacity * 2;
        if (!farmerRate) return max;

        const sourceCapacity = _.sum(sources, src => src.energyCapacity);
        return Math.min(max, sourceCapacity / farmerRate);
    }

    suppressNano() {
        const t = this.room!.memory.tenemies || 0;
        if (t < kMicroEnemyTicks) return null;
        return null;
        // TODO implment Micro Range + Move with only targeting of non-ranged creeps.
        //return this.paceNJobs(Micro, 1);
    }

    // team.ts suppressMini: any enemy creep in the room (scouts included)
    // draws a cheap mini. The tenemies ratchet resets 10 ticks after the last
    // enemy leaves, so this stops on its own.
    suppressMini() {
        const t = this.room!.memory.thostiles || 0;
        if (t < kMiniHostileTicks) return null;
        return this.paceJobs(Mini, kMiniPace);
    }

    // team.ts suppressGuard: armed hostiles for kGuardHostileTicks draw a
    // guard, faster the longer they stay: one per max(1500 - thostiles, 350).
    suppressGuard() {
        const t = this.room!.memory.thostiles || 0;
        if (t < kGuardHostileTicks) return null;
        return this.paceJobs(Guard, this.suppressRate(t));
    }

    // team.ts suppressWolf: once armed hostiles have camped the room for
    // kWolfHostileTicks, lay wolves at the same shrinking cadence.
    suppressWolf() {
        const t = this.room!.memory.thostiles || 0;
        if (t < kWolfHostileTicks) return null;
        return this.paceJobs(Wolf, this.suppressRate(t));
    }

    // Ticks between suppression eggs after t ticks of hostile presence.
    suppressRate(t: number): number {
        return Math.max(kSuppressPace - t, kSuppressMinPace);
    }

    // team.ts suppressInvaderCore: while an invader core stands in the farm
    // room, lay one wolf at most every 1500 ticks.
    suppressInvaderCore() {
        if (!this.room!.findStructs(STRUCTURE_INVADER_CORE).length) return null;
        return this.paceJobs(Wolf, 1500);
    }

    // Someone else's reservation on the farm controller, or null.
    foreignReservation(): ReservationDefinition | null {
        const controller = this.room?.controller;
        if (!controller || controller.owner) return null;
        const res = controller.reservation;
        if (!res || res.username === whoami()) return null;
        return res;
    }

    // Farmers cannot harvest a room someone else holds; hold them back until
    // the foreign reservation is nearly gone. An invisible room is assumed free.
    foreignReserved(): boolean {
        const res = this.foreignReservation();
        return !!res && res.ticksToEnd > 100;
    }

    // Only contest a controller someone else has reserved, and only while no
    // armed hostiles are in the room. The reserver job itself attacks the
    // foreign reservation, then reserves once it drops.
    reserve() {
        const room = this.room!;
        if (room.hostiles.length) return null;
        const res = this.foreignReservation();
        if (!res) return null;
        // attackController strips 1 reservation tick per CLAIM part per tick,
        // so the reservers already alive may be enough to clear it.
        if (this.reservePower() >= res.ticksToEnd) return null;
        return this.paceJobs(Reserver, this.reserverRate());
    }

    // Remaining attack power of the mission's reservers (spawning ones
    // included): ticks to live times CLAIM parts, summed.
    reservePower(): number {
        const reservers = [...this.roleCreeps("reserver"), ...this.roleHatches("reserver")];
        return _.sum(reservers, r => {
            const c = r.c;
            if (!c) return 0;
            const ttl = c.ticksToLive ?? CREEP_CLAIM_LIFE_TIME;
            return ttl * c.getActiveBodyparts(CLAIM);
        });
    }

    // One reserver per controller spot per reserver lifetime, so every spot
    // stays filled. paceCreeps clamps this to its minimum cadence.
    reserverRate(): number {
        const nspots = getSpots(this.room!.controller!.pos).length || 1;
        return Math.floor(kReserverLife / nspots);
    }
}
