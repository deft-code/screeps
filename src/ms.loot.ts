import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Canopener } from "job.canopener";
import { Looter } from "job.looter";
import { coverAt } from "job.bulldozer";

// Loots a beaten invader stronghold: "Loot <room> [home]". The core is
// gone, its containers stay, each under a rampart that stops withdraw.
// Without vision one Scout (job.scout.ts, from the home room) goes for a
// look. With it, one Canopener (job.canopener.ts, 32 WORK 16 MOVE) per
// container still under a rampart that is not ours (coveredRamparts)
// dismantles them, and one Looter (job.looter.ts, a Sktrucker that takes
// every resource) while an uncovered container holds anything. Invader
// creeps left over from the stronghold are ignored (the defenders outlive
// the core by tens of thousands of ticks and hold their ramparts); only a
// standing invader core (cored) stops the eggs. Once every container in the
// room is empty (none at all counts) the mission winds down.
//
//   scheduleService('Loot W24S6 W25S7')   // args[1]=stronghold room, args[2]=home room (spawns)
@register
export class Loot extends Mission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.args[2] || null;
        return super.getRoomName(alias);
    }

    // Every container in the room; none without vision.
    containers(): StructureContainer[] {
        const room = this.room;
        if (!room) return [];
        return room.findStructs(STRUCTURE_CONTAINER) as StructureContainer[];
    }

    // The rampart shielding `cont` from withdraw (one on its tile that is
    // not ours and still has hits: job.bulldozer coverAt), or null.
    static coverOf(cont: StructureContainer): StructureRampart | null {
        return coverAt(cont.pos);
    }

    // The ramparts the canopeners take down: one per covered container.
    coveredRamparts(): StructureRampart[] {
        return _.compact(this.containers().map(Loot.coverOf)) as StructureRampart[];
    }

    // The containers a looter can withdraw from.
    openContainers(): StructureContainer[] {
        return this.containers().filter(k => !Loot.coverOf(k));
    }

    // An invader core still stands in the room: too early to loot.
    get cored(): boolean {
        return !!this.room?.findStructs(STRUCTURE_INVADER_CORE).length;
    }

    // Vision and nothing left in any container.
    get empty(): boolean {
        return !!this.room && _.all(this.containers(), k => !k.store.getUsedCapacity());
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        if (!this.room) {
            this.nJobs(Scout, 1);
        } else if (this.empty) {
            debug.log(this.name, "every container in", this.roomName, "is empty - winding down");
            this.windDown();
        } else if (!this.cored) {
            this.nJobs(Canopener, this.coveredRamparts().length);
            this.nJobs(Looter, _.any(this.openContainers(), k => k.store.getUsedCapacity() > 0) ? 1 : 0);
        }
        super.run();
        return "normal";
    }

    status(): string {
        if (!this.room) return super.status() + " no vision";
        const conts = this.containers().map(k => `${Loot.coverOf(k) ? "covered" : "open"}@${k.pos.x},${k.pos.y}:${k.store.getUsedCapacity()}`);
        return super.status() + ` containers:${conts.join(" ") || "none"}` + (this.cored ? " cored" : "");
    }
}
