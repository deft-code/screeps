import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { RoomIntel } from "intel";
import { defaultRewalker } from "Rewalker";
import { Chaos } from "job.chaos";
import { Scout } from "job.scout";

const rewalker = defaultRewalker();

// Rebuild the reserved/claimed lists from intel this often.
const kScanTicks = 50;
// An active room is at most this many route hops from the mission room.
const kActiveHops = 2;
// This many armed defenders in the active room moves the mission on.
const kDefenders = 2;
// Ticks a creep spends per room on the way, for the spawn pace.
const kTicksPerRoom = 50;
// The active creep count the pace aims for.
const kActiveChaos = 2;

interface NidoranMemory extends MissionMemory {
    // The player whose remotes are harassed (learned from the mission room's
    // intel unless given as args[2]).
    player?: string
    // Rooms the player reserves / owns, from intel at the last scan.
    reserved?: string[]
    claimed?: string[]
    // Reserved rooms no route reaches without crossing a claimed room.
    bad?: string[]
    // The room the chaos creeps work, and when it was picked.
    active?: string
    since?: number
    scanned?: number
}

// Harass a player's remote rooms: "Nidoran <room> [player]". The command
// room is the center: the player is the one reserving or owning it in
// intel (or args[2]); the first Nidoran begins at W23S4. Every kScanTicks
// the intel of every room in memory is scanned for the rooms that player
// reserves (reserved) and owns (claimed). The mission room (roomName, what
// the Scout and the chaos creeps head for) is the active room: a reserved
// room within kActiveHops of the center by Game.map.findRoute with the
// claimed rooms forbidden; a reserved room no such route reaches goes on
// the bad list for good. Candidates are tried oldest intel first (the room
// we have gone longest without seeing), so the mission rotates around the
// player's remotes. The active room is dropped for a new one when, with
// vision, it holds kDefenders armed creeps or no road or container. With
// no candidate known yet (no intel) the center is the mission room. A
// Scout keeps the mission room in view, paced at one per CREEP_LIFE_TIME
// less kTicksPerRoom per route hop from the nearest owned room to the
// center.
//
// Chaos creeps (job.chaos.ts: 5 MOVE 1 WORK dismantlers that flee anything
// armed within 5) are paced at one per (CREEP_LIFE_TIME - kTicksPerRoom *
// dist) / kActiveChaos ticks, dist being the route distance from the
// nearest room we own to the active room: about kActiveChaos at work at
// once, the travel time taken off the top. They spawn from the "close"
// spawns of the mission room (job.chaos.ts).
//
//   scheduleService('Nidoran W23S4')
@register
export class Nidoran extends Mission {
    // The room the command named: the default mission room and the point
    // the active rooms are within kActiveHops of.
    get center(): string {
        return this.args[1];
    }

    // The mission room, where the Scout and the chaos creeps go: the
    // active room, the center until intel names one.
    get roomName(): string {
        return this.memory.active || this.center;
    }

    get memory(): NidoranMemory {
        return super.memory as NidoranMemory;
    }

    // The room the chaos creeps work: the mission room.
    get active(): string {
        return this.roomName;
    }

    // The player being harassed: args[2], else whoever the center's intel
    // says holds it, remembered once seen.
    get player(): string | null {
        if (this.args[2]) return this.args[2];
        if (this.memory.player) return this.memory.player;
        const owner = RoomIntel.get(this.center)?.owner;
        if (owner) this.memory.player = owner;
        return owner || null;
    }

    get claimed(): string[] {
        return this.memory.claimed || [];
    }

    get reserved(): string[] {
        return this.memory.reserved || [];
    }

    get bad(): string[] {
        return this.memory.bad || [];
    }

    // The rooms we own.
    get homes(): string[] {
        return _.filter(Game.rooms, r => !!r.controller?.my).map(r => r.name);
    }

    // The owned room nearest `roomName` by route, and that distance.
    nearestHome(roomName: string): [string | null, number] {
        let best: string | null = null;
        let bestDist = Infinity;
        for (const home of this.homes) {
            const d = rewalker.getRouteDist(home, roomName);
            if (d < bestDist) {
                best = home;
                bestDist = d;
            }
        }
        return [best, bestDist];
    }

    // Route hops from the center to `roomName` with the claimed rooms
    // forbidden; -1 when no such route exists.
    hops(roomName: string): number {
        if (roomName === this.center) return 0;
        const claimed = new Set(this.claimed);
        const ret = Game.map.findRoute(this.center, roomName, {
            routeCallback: r => claimed.has(r) ? Infinity : 1,
        });
        if (ret === ERR_NO_PATH) return -1;
        return ret.length;
    }

    // Rebuild reserved/claimed from every room's intel.
    scan() {
        const player = this.player;
        if (!player) return;
        const reserved: string[] = [];
        const claimed: string[] = [];
        for (const name in Memory.rooms) {
            const intel = RoomIntel.get(name);
            if (!intel || intel.owner !== player) continue;
            if (intel.rcl) claimed.push(name);
            else reserved.push(name);
        }
        const mem = this.memory;
        mem.reserved = reserved;
        mem.claimed = claimed;
        mem.scanned = Game.time;
        debug.dlog(this.name, "scan: reserved", reserved.join(","), "claimed", claimed.join(","));
    }

    // Reserved rooms a route reaches within kActiveHops, oldest intel
    // first, not `skip`. Unreachable ones are added to bad on the way.
    candidates(skip?: string): string[] {
        const mem = this.memory;
        const bad = mem.bad = mem.bad || [];
        const out: string[] = [];
        for (const name of this.reserved) {
            if (name === skip || _.contains(bad, name) || _.contains(this.claimed, name)) continue;
            const hops = this.hops(name);
            if (hops < 0) {
                debug.log(this.name, name, "unreachable without crossing a claimed room, never again");
                bad.push(name);
                continue;
            }
            if (hops > kActiveHops) continue;
            out.push(name);
        }
        return _.sortBy(out, name => -(RoomIntel.get(name)?.staleness || 0));
    }

    // Drop the room in use (skip) and pick the stalest other candidate as
    // the mission room; the center when there is none. Nothing to say when
    // nothing changes: already on the center with no alternative.
    pickActive(why: string, skip?: string) {
        const mem = this.memory;
        const next = _.first(this.candidates(skip)) || null;
        if (!next && !mem.active) return;
        debug.log(this.name, "mission room", this.roomName, "->", next || this.center, ":", why);
        if (next) mem.active = next;
        else delete mem.active;
        mem.since = Game.time;
    }

    // Why the active room should be given up, or null: seen with kDefenders
    // armed creeps, seen with nothing to dismantle, or no longer reserved.
    stale(): string | null {
        const mem = this.memory;
        if (mem.active && !_.contains(this.reserved, mem.active)) return "no longer reserved by " + this.player;
        const room = Game.rooms[this.active];
        if (!room) return null;
        const defenders = (room.hostiles || []).filter(h => !h.keeper).length;
        if (defenders >= kDefenders) return defenders + " defenders";
        const targets = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER,
        });
        if (!targets.length) return "no roads or containers";
        return null;
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const mem = this.memory;
        if (!mem.scanned || Game.time - mem.scanned >= kScanTicks) this.scan();
        const why = this.stale();
        if (why) this.pickActive(why, this.active);
        else if (!mem.active) this.pickActive("first candidate");

        // One scout on station at a time: a new one every lifetime less the
        // walk from the nearest owned room to the center.
        const [, centerDist] = this.nearestHome(this.center);
        const scoutRate = CREEP_LIFE_TIME - kTicksPerRoom * centerDist;
        if (scoutRate > 0) this.paceJobs(Scout, scoutRate);
        const [, dist] = this.nearestHome(this.active);
        const rate = (CREEP_LIFE_TIME - kTicksPerRoom * dist) / kActiveChaos;
        if (rate > 0) this.paceJobs(Chaos, rate);
        super.run();
        return "normal";
    }

    status(): string {
        const mem = this.memory;
        const room = Game.rooms[this.active];
        return super.status() +
            ` player:${this.player} center:${this.center} active:${this.active}${room ? "" : "(blind)"} since:${mem.since ? Game.time - mem.since : "-"}` +
            ` reserved:${this.reserved.length} claimed:${this.claimed.length} bad:${this.bad.length}` +
            ` dist:${this.nearestHome(this.active)[1]}`;
    }
}
