import { Mission, MissionMemory } from "mission";
import { register, Priority, Service } from "process";
import { Paver } from "job.paver";
import * as debug from "debug";

// One paver (job.paver.ts) every kPaverPace ticks while we have construction
// sites in the room; once the last site is gone the mission winds down, so
// the living pavers finish their lives and the mission deschedules itself.
const kPaverPace = 1400;
// A mission that has been without sites this long gives its pavers with
// more than kDonateTTL ticks to live to an adjacent PaveAll (describeExits)
// that still has sites, the one with the most. Younger idle missions keep
// theirs: sites often come back within a few ticks of a replan.
const kDonateIdle = 50;
const kDonateTTL = 100;

interface PaveAllMemory extends MissionMemory {
    // Tick the room ran out of our construction sites (windDown time).
    idleSince?: number
}

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

    get pmem(): PaveAllMemory {
        return this.memory as PaveAllMemory;
    }

    // Our construction sites in the room. Game.constructionSites holds sites
    // in rooms we cannot see too, so this works without vision.
    nSites(): number {
        return _.sum(Game.constructionSites, s => s.pos.roomName === this.roomName ? 1 : 0);
    }

    // Still laying pavers: scheduled, not winding down, sites to build.
    get active(): boolean {
        return !this.windingDown && this.nSites() > 0;
    }

    run(): Priority {
        if (this.windingDown) {
            if (this.nSites()) {
                this.revive();
            } else {
                this.donatePavers();
                return super.run();
            }
        }

        if (!this.nSites()) {
            debug.log(this.name, "no construction sites left");
            this.pmem.idleSince = Game.time;
            this.windDown();
        } else {
            this.paceJobs(Paver, kPaverPace);
        }
        super.run();
        return "normal";
    }

    // Sites are back (a replan, a new road leg): stop winding down and lay
    // pavers again. Only the bookkeeping of the base windDown is undone; the
    // paver pace timer is kept, so the next egg comes on the old cadence.
    revive() {
        debug.log(this.name, "sites again, reviving");
        delete this.memory.windDown;
        delete this.memory.tombs;
        delete this.pmem.idleSince;
    }

    // The active PaveAll missions of the rooms next to this one, most sites
    // first.
    adjacentActive(): PaveAll[] {
        const rooms = _.values<string>(Game.map.describeExits(this.roomName) || {});
        const missions = rooms.map(r => Service.getType(`PaveAll ${r}`) as PaveAll | null);
        return _.sortBy(missions.filter(m => m instanceof PaveAll && m.active) as PaveAll[], m => -m.nSites());
    }

    // Idle for kDonateIdle ticks: every paver with more than kDonateTTL to
    // live goes to the busiest adjacent PaveAll, if there is one.
    donatePavers() {
        const since = this.pmem.idleSince;
        if (since === undefined || Game.time - since < kDonateIdle) return;
        if (!this.memory.creeps.length) return;
        const target = _.first(this.adjacentActive());
        if (!target) return;
        for (const paver of this.roleCreeps("paver")) {
            if (!paver.c || paver.ticksToLive <= kDonateTTL) continue;
            this.donateCreep(paver.name, target);
        }
    }

    status(): string {
        const since = this.pmem.idleSince;
        const idle = since === undefined ? "" : ` idle:${Game.time - since}`;
        return super.status() + ` sites:${this.nSites()}${idle}`;
    }
}
