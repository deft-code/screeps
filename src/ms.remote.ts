import { Mission } from "mission";
import { Farm } from "ms.farm";
import { register, Priority } from "process";
import { Scout } from "job.scout";
import { Reserver } from "job.reserver";
import { whoami } from "Rewalker";

// team.ts reserve(): a reserver every 225 ticks holds a room's reservation;
// slow to 450 once ours is above 450 ticks and stop above 1000.
const kReservePace = 225;
const kReservePaceSlow = 450;
const kReserveSlowAt = 450;
const kReserveStopAt = 1000;

// Port of team.ts teamRemote to the mission system, in phases.
// Phase 1 (this file): visibility (Scout) and a held reservation (Reserver),
// plus the Farm rule against invader cores (Wolf). Phase 2 adds harvester/paver/trucker and
// the makePathway road planning.
//
// Extends Farm so suppressInvaderCore is shared, but run() and reserve() are
// replaced: no farmers are laid, and the reservation is maintained rather than
// only contested.
//
// Schedule from the console:
//   scheduleService('Remote W5N8 W6N8')   // args[1]=remote room, args[2]=home room
@register
export class Remote extends Farm {
    run(): Priority {
        if (this.windingDown) return Mission.prototype.run.call(this);

        if (!this.room) {
            // No visibility: a scout parks in the room until a reserver arrives.
            this.nJobs(Scout, 1);
        } else {
            // Both may lay an egg in the same tick.
            this.suppressInvaderCore();
            this.reserve();
        }
        // Farm.run() would lay farmers, so reach Mission.run() directly.
        Mission.prototype.run.call(this);
        return "normal";
    }

    // team.ts reserve() (line 693): keep the controller reserved for us. Farm
    // only lays reservers to undo a foreign (invader core) reservation; here
    // they are paced continuously. A foreign reservation needs no special
    // case: the Reserver job attacks it when reserveController is refused.
    reserve() {
        const room = this.room!;
        if (room.hostiles.length) return null;
        const controller = room.controller;
        if (!controller || controller.owner) return null;

        let pace = kReservePace;
        const res = controller.reservation;
        if (res && res.username === whoami()) {
            if (res.ticksToEnd > kReserveStopAt) return null;
            if (res.ticksToEnd > kReserveSlowAt) pace = kReservePaceSlow;
        }
        return this.paceJobs(Reserver, pace);
    }

    status(): string {
        const res = this.room?.controller?.reservation;
        const held = res ? ` reserved:${res.username}/${res.ticksToEnd}` : " reserved:-";
        return super.status() + held;
    }
}
