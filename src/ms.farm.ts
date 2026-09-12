import { Mission } from "mission";
import { register, Priority } from "process";
import { Farmer } from "job.farmer";
import { Scout } from "job.scout";
import { Wolf } from "job.wolf";
import { Reserver } from "job.reserver";
import { whoami } from "Rewalker";
import { getSpots } from "spots";

// A CLAIM creep lives 600 ticks; leave 50 for the walk to the controller.
const kReserverLife = CREEP_CLAIM_LIFE_TIME - 50;

// Schedule from the console:
//   require('process').Service.schedule('Farm W5N8 W6N8')     // args[1]=farm room, args[2]=home room
//   require('process').Service.schedule('Farm W5N8 W6N8 2')   // optional args[3]=number of farmers (default 1)
@register
export class Farm extends Mission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.args[2];
        return super.getRoomName(alias);
    }

    get nFarmers() {
        return Number(this.args[3]) || 1;
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        if (!this.room) {
            // No visibility: a scout keeps intel flowing until a farmer arrives.
            this.nJobs(Scout, 1);
        } else {
            // Both may lay an egg in the same tick: a wolf for the core and a
            // reserver to contest a foreign reservation.
            this.suppressInvaderCore();
            this.reserve();
        }
        if (!this.foreignReserved()) {
            this.nJobs(Farmer, this.nFarmers);
        }
        super.run();
        return "normal";
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
    // stays filled. paceCreeps refuses rates below 100, so clamp there.
    reserverRate(): number {
        const nspots = getSpots(this.room!.controller!.pos).length || 1;
        return Math.max(100, Math.floor(kReserverLife / nspots));
    }
}
