import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Razer } from "job.razer";
import { dozeableStruct } from "job.bulldozer";
import { stompable } from "job.scout";

// Clear a room of what others left behind: "Raze <room> [home]". One Razer
// (job.razer.ts) on the Bulldozer body, from the spawns nearest home (the
// home argument; else the razer's own spawn room) dismantles every
// structure in the room that is not ours and stomps the foreign
// construction sites, then, idle for kIdleTicks, walks back to its spawn to
// be recycled. The mission winds down as soon as its razer decommissions,
// or when it sees the room holds no structure another player owns (walls,
// ramparts and sites alone are not worth a razer; an unhatched egg is
// purged).
//
//   scheduleService('Raze W27S4 W27S5')
@register
export class Raze extends Mission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.args[2] || null;
        return super.getRoomName(alias);
    }

    // What is left to clear, or null without vision: the structures another
    // player owns that a razer can take down, and the foreign sites.
    get left(): { structs: number, sites: number } | null {
        const room = this.room;
        if (!room) return null;
        return {
            structs: room.find(FIND_HOSTILE_STRUCTURES, { filter: dozeableStruct }).length,
            sites: stompable(room).length,
        };
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const role = Razer.name.toLowerCase();
        const decomm = _.any(this.roleCreeps(role), c => c.memory.decomm);
        const left = this.left;
        if (decomm || (left !== null && !left.structs)) {
            debug.log(this.name, decomm ? "razer decommissioning" : "no enemy structures in " + this.roomName, "- winding down");
            this.windDown();
        } else {
            this.nJobs(Razer, 1);
        }
        super.run();
        return "normal";
    }

    status(): string {
        const left = this.left;
        return super.status() + (left ? ` structs:${left.structs} sites:${left.sites}` : " no vision");
    }
}
