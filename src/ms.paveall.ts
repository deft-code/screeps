import { Mission } from "mission";
import { register, Priority, Service } from "process";
import { Paver } from "job.paver";
import * as debug from "debug";

// One paver (job.paver.ts) every kPaverPace ticks while we have construction
// sites in the room; once the last site is gone the mission winds down, so
// the living pavers finish their lives and the mission deschedules itself.
const kPaverPace = 1400;

// Remote and Startup call PaveAll.request(room) for every unowned room on
// their roads with our sites in it. From the console:
//   scheduleService('PaveAll W27S9')   // args[1]=room to pave
@register
export class PaveAll extends Mission {
    get roomName() {
        return this.args[1];
    }

    // Schedule "PaveAll <room>" unless it is already running (winding down
    // included: its pavers still work, and the next request after it is gone
    // starts a fresh one). Returns the command when it was scheduled.
    static request(roomName: string, by: string): string | null {
        const cmd = `PaveAll ${roomName}`;
        if (Service.getType(cmd)) return null;
        debug.log(by, "scheduling", cmd);
        Service.schedule(cmd);
        return cmd;
    }

    // Our construction sites in the room. Game.constructionSites holds sites
    // in rooms we cannot see too, so this works without vision.
    nSites(): number {
        return _.sum(Game.constructionSites, s => s.pos.roomName === this.roomName ? 1 : 0);
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        if (!this.nSites()) {
            debug.log(this.name, "no construction sites left");
            this.windDown();
        } else {
            this.paceJobs(Paver, kPaverPace);
        }
        super.run();
        return "normal";
    }

    status(): string {
        return super.status() + ` sites:${this.nSites()}`;
    }
}
