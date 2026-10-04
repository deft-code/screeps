import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Fedex } from "job.fedex";

// The mission ends once the home storage holds less energy than this
// (0 with takeitall)...
const kHomeFloor = 50000;
// ...or the mission room's storage is fuller than this fraction.
const kDestFull = 0.75;
// Fedexes laid per lifetime unless the command names a count.
const kDefaultCount = 2;

interface XferMemory extends MissionMemory {
    // Drain the home storage to 0 instead of stopping at kHomeFloor. Set
    // from the console via `takeitall`.
    takeitall?: boolean
}

// Carry energy from one room's storage to another room on foot.
//
//   scheduleService('Xfer W27S4 W29S4')     // args[1]=room to fill, args[2]=room to take from ("home")
//   scheduleService('Xfer W27S4 W29S4 3')   // optional args[3]=fedexes per lifetime (default 2)
//   getService('Xfer W27S4 W29S4').takeitall = true   // drain the home storage to 0
//
// Lays args[3] fedexes (job.fedex.ts) per lifetime from the home room's
// spawns (paceNJobs: one egg every 1500 / n ticks, so n alive at a time).
// It runs until the home storage holds under 50k energy (nothing at all with
// takeitall) or the mission room's storage is more than 75% full, then winds
// down: no more eggs, the fedexes deliver what they carry and recycle, and
// the mission deschedules itself.
@register
export class Xfer extends Mission {
    get roomName() {
        return this.args[1].toUpperCase();
    }

    get homeName(): string {
        return this.args[2].toUpperCase();
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.homeName;
        return super.getRoomName(alias);
    }

    get count(): number {
        const n = Number(this.args[3]);
        return n > 0 ? n : kDefaultCount;
    }

    get mem(): XferMemory {
        return this.memory as XferMemory;
    }

    get takeitall(): boolean {
        return !!this.mem.takeitall;
    }

    set takeitall(on: boolean) {
        const was = this.takeitall;
        this.mem.takeitall = !!on;
        if (was !== this.takeitall) debug.log(this.name, "takeitall", on ? "on" : "off");
    }

    // Energy in the home storage; null without vision of the home room.
    get homeEnergy(): number | null {
        const home = this.getRoom("home");
        if (!home) return null;
        return home.storage?.store.energy || 0;
    }

    // How full the mission room's storage is, 0..1; null without vision or
    // without a storage of ours there.
    get destFill(): number | null {
        const storage = this.room?.storage;
        if (!storage || !storage.my) return null;
        return storage.store.getUsedCapacity() / storage.store.getCapacity();
    }

    // Why the mission is over, or null while it should keep running.
    get finished(): string | null {
        const energy = this.homeEnergy;
        if (energy !== null) {
            if (this.takeitall ? energy <= 0 : energy < kHomeFloor) {
                return `${this.homeName} storage down to ${energy} energy`;
            }
        }
        const fill = this.destFill;
        if (fill !== null && fill > kDestFull) {
            return `${this.roomName} storage ${Math.round(fill * 100)}% full`;
        }
        return null;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        const why = this.finished;
        if (why) {
            debug.log(this.name, "done:", why);
            this.windDown();
            return super.run();
        }
        this.paceNJobs(Fedex, this.count);
        super.run();
        return "normal";
    }

    status(): string {
        const fill = this.destFill;
        return super.status() + ` home:${this.homeEnergy ?? "-"} dest:${fill === null ? "-" : Math.round(fill * 100) + "%"}` +
            ` n:${this.count} takeitall:${this.takeitall}`;
    }
}
