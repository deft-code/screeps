import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { theRadar } from "radar";
import { defaultRewalker } from "Rewalker";
import { findReactors } from "reactor";
import { RoomIntel, roomToCoord } from "intel";
import { Usurper } from "job.usurper";

// Steals another sector's reactor: "StealReactor <core>". Every tick it
// asks the radar to observe the core room. With vision it judges the room
// (judge): a reactor holding thorium that is not ours, no creep with a
// CLAIM part (anyone's) means spawn mode; armed enemies there are reported
// by status() but do not hold the egg back (since 28 Oct 2026)
// (memory.spawning, kept until the next look says otherwise). In spawn mode
// it picks the home: the owned room with spawns whose route to the core
// crosses the fewest rooms (memory.home, repicked every 100 ticks), takes
// the Rewalker's route from there to the core and asks the
// radar to observe every room of it. Once intel says every room on the
// route was seen under kFresh ticks ago it lays one Usurper
// (job.usurper.ts, nJobs: one alive at a time) from the home room, which
// walks there, claims the reactor and goes to die in a keeper room next
// door. A reactor that reads `my` ends spawn mode and, remembered as
// memory.ours from the last look, holds the egg back on its own, so one
// claim does not draw usurper after usurper.
//
//   scheduleService('StealReactor W15S5')
const kFresh = 50;

interface StealMemory extends MissionMemory {
    spawning?: boolean
    home?: string
    // The reactor read `my` at the last look.
    ours?: boolean
}

@register
export class StealReactor extends Mission {
    get roomName() {
        return this.args[1];
    }

    get mem(): StealMemory {
        return this.memory as StealMemory;
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.mem.home || null;
        return super.getRoomName(alias);
    }

    // Why the core is not ripe, or null when it is; null too without
    // vision (no judgement).
    judge(): string | null | undefined {
        const room = this.room;
        if (!room) return undefined;
        const reactor = findReactors(room)[0];
        if (!reactor) return "no reactor";
        this.mem.ours = reactor.my;
        if (reactor.my) return "reactor is ours";
        if (!(reactor.store[RESOURCE_THORIUM!] > 0)) return "reactor unfueled";
        if (room.find(FIND_CREEPS, { filter: c => c.getActiveBodyparts(CLAIM) > 0 }).length) return "a claimer is there";
        // Armed enemies in the room no longer hold the egg back (28 Oct 2026):
        // the usurper takes its chances; status() still names them.
        return null;
    }

    // The owned room with spawns whose Rewalker route to the core crosses
    // the fewest rooms (Manhattan distance breaks ties; since 28 Oct 2026,
    // Manhattan alone before: W25S9 is 6 rooms from W25S15 by Manhattan but
    // its route runs through W26S8, 2 rooms longer than starting there).
    pickHome(): string | null {
        const [tx, ty] = roomToCoord(this.roomName);
        const homes = _.uniq(_.map(Game.spawns, s => s.room.name));
        if (!homes.length) return null;
        const walker = defaultRewalker();
        return _.min(homes, h => {
            const [x, y] = roomToCoord(h);
            const manhattan = Math.abs(x - tx) + Math.abs(y - ty);
            const rooms = walker.getRoute(h, this.roomName).length || Infinity;
            return rooms * 100 + manhattan;
        });
    }

    // The rooms walked from home to the core, home and core included.
    route(): string[] {
        const home = this.mem.home;
        if (!home) return [];
        return defaultRewalker().getRoute(home, this.roomName);
    }

    // Ticks since the stalest room on the route was seen.
    routeStale(): number {
        return _.max(this.route().map(r => RoomIntel.get(r)?.staleness ?? Infinity)) as number;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        theRadar.observe(this.roomName);
        const why = this.judge();
        if (why !== undefined) {
            const spawning = why === null;
            if (spawning !== !!this.mem.spawning) debug.log(this.name, spawning ? "spawn mode" : "watching: " + why);
            this.mem.spawning = spawning;
        }
        if (this.mem.spawning) {
            // Repicked every 100 ticks: a route per spawning room each pick.
            if (!this.mem.home || Game.time % 100 === 0) this.mem.home = this.pickHome() || undefined;
            const route = this.route();
            if (route.length) {
                theRadar.observe(...route);
                if (this.routeStale() < kFresh && !this.mem.ours) this.nJobs(Usurper, 1);
            }
        }
        super.run();
        return "normal";
    }

    status(): string {
        const why = this.judge();
        const armed = this.room ? _.filter(this.room.hostiles || [], h => !h.keeper).length : 0;
        const look = (why === undefined ? "no vision" : why === null ? "ripe" : why) + (armed ? ` armed:${armed}` : "");
        const route = this.route();
        const usurpers = this.roleCreeps("usurper").filter(u => u.c).map(u => `${u.name}@${u.pos.roomName} ${u.pos.x},${u.pos.y} ${u.memory.usurp || ""}`);
        return super.status() + ` ${look} mode:${this.mem.spawning ? "spawn" : "watch"}${this.mem.ours ? " ours" : ""} home:${this.mem.home || "-"}` +
            ` route:${route.length} stale:${route.length ? this.routeStale() : "-"}` +
            (usurpers.length ? ` ${usurpers.join(" ")}` : "");
    }
}
