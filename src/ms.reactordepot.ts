import { register } from "process";
import * as debug from "debug";
import { Reactor, ReactorMemory, RunnerClass } from "ms.reactor";
import { Warrunner } from "job.warrunner";
import { Scout } from "job.scout";
import { defaultRewalker } from "Rewalker";
import { roomKind, Kind, RoomIntel } from "intel";

// The home terminal must hold more thorium than this before a warrunner is laid.
const kDepotMin = 1000;

// Ticks of one warrunner round trip: the walk both ways (~120 each from
// W25S7) plus loading. Tune from observation.
const kRunnerCycle = 300;

// A warrunner laid now lands about this much later: ~55 to spawn once the
// room has 900 energy, a tick to load, 120-290 to walk.
const kLeadTicks = 300;

// An invader core seen in a Source Keeper room on the route, or one of ours
// dying in such a room while its intel shows a core, pauses everything but
// scouts for this long. The scouts keep walking the route, so each one that
// sees the core (or dies to it) renews the pause until the core is gone.
const kSkCorePause = 2500;

// One scout per this many ticks while paused: the same pace as unpaused, so
// the core stays watched without feeding the core a creep every few ticks.
const kScoutPace = 1400;

// Ticks between route recomputations (Rewalker caches its own for 500).
const kRoutePace = 500;

export interface ReactorDepotMemory extends ReactorMemory {
    // Rooms walked from home to the core, home first, and the SK ones among them.
    route?: string[]
    skRooms?: string[]
    routed?: number
    // Room whose invader core set the current pause, for status.
    coreRoom?: string
}

const rewalker = defaultRewalker();

// Reactor fed from a terminal instead of a mine: everything ms.reactor does
// (scout for vision, probe, guard against enemies, immortan holding the
// reactor, invader-core pause) but the thorium runner is a Warrunner that
// loads from the home room's terminal, laid only while that terminal holds
// more than kDepotMin thorium (Thormine ships it there, ms.thormine.ts).
//
// The route the runners walk (Rewalker.getRoute home -> core, refreshed every
// kRoutePace ticks) is kept in memory with its Source Keeper rooms. Every
// tick each SK room on the route we can see is checked for an invader core;
// one with a level pauses everything but scouts for kSkCorePause ticks,
// purging the other eggs. Scouts keep walking the route (paceJobs while
// paused), so their vision, or their death in a room whose intel shows a
// core, renews the pause until the core is cleared or collapses.
//
//   scheduleService('ReactorDepot W25S7')     // args[1]=home room: spawns and the terminal
//   scheduleService('ReactorDepot W25S7 2')   // optional args[2]=cap on warrunners
@register
export class ReactorDepot extends Reactor {
    get dmem(): ReactorDepotMemory {
        return this.memory as ReactorDepotMemory;
    }

    get runnerClass(): RunnerClass {
        return Warrunner;
    }

    get runnerCycle(): number {
        return kRunnerCycle;
    }

    get leadTicks(): number {
        return kLeadTicks;
    }

    // Thorium in the home terminal, 0 without one or without vision.
    get depot(): number {
        const term = this.getRoom("home")?.terminal;
        return term && RESOURCE_THORIUM ? term.store[RESOURCE_THORIUM] || 0 : 0;
    }

    homeHasThorium(home: Room): boolean {
        return this.depot > kDepotMin;
    }

    // The rooms from home to the core as Rewalker routes them, and the SK
    // rooms among them; recomputed every kRoutePace ticks.
    get route(): string[] {
        const mem = this.dmem;
        if (!mem.route || Game.time - (mem.routed || 0) >= kRoutePace) {
            const route = rewalker.getRoute(this.homeName, this.roomName);
            const sk = route.filter(r => roomKind(r) === Kind.SourceKeeper);
            if (!_.isEqual(sk, mem.skRooms)) {
                debug.log(this.name, "route", route.join(">"), "sk:", sk.join(",") || "none");
            }
            mem.route = route;
            mem.skRooms = sk;
            mem.routed = Game.time;
        }
        return mem.route;
    }

    get skRooms(): string[] {
        this.route;
        return this.dmem.skRooms || [];
    }

    // Every tick: look for an invader core in each visible SK room on the route.
    watch() {
        for (const roomName of this.skRooms) {
            const room = Game.rooms[roomName];
            if (!room) continue;
            const core = _.first(room.findStructs(STRUCTURE_INVADER_CORE)) as StructureInvaderCore | undefined;
            if (core && core.level > 0) this.pauseFor(roomName, core.level, "seen");
        }
    }

    // Pause everything but scouts for kSkCorePause ticks from now, purging the
    // other eggs. Logged when the pause starts, then every 500 ticks of renewal.
    pauseFor(roomName: string, lvl: number, why: string) {
        const mem = this.dmem;
        const fresh = !this.paused;
        mem.pauseUntil = Game.time + kSkCorePause;
        mem.coreRoom = roomName;
        this.purgeEggs([Scout.name.toLowerCase()]);
        if (fresh || Game.time % 500 === 0) {
            debug.log(this.name, "level", lvl, "invader core in", roomName, `(${why});`,
                fresh ? "pausing" : "still paused", "until", mem.pauseUntil);
        }
    }

    // Scouts still go out while paused: their walk through the SK rooms is
    // how the core is watched, and their deaths renew the pause.
    whilePaused() {
        this.paceJobs(Scout, kScoutPace);
    }

    // A creep dying in an SK room on the route whose intel shows a core keeps
    // the mission paused; any other death is the Reactor rule (1500 ticks for
    // a core in whatever room it died in, all eggs purged).
    creepDied(name: string) {
        const seen = this.dmem.seen || {};
        const roomName = seen[name];
        if (roomName && _.contains(this.skRooms, roomName)) {
            const lvl = RoomIntel.get(roomName)?.coreLvl || 0;
            if (lvl > 0) {
                delete seen[name];
                this.pauseFor(roomName, lvl, `${name} died`);
                return;
            }
        }
        super.creepDied(name);
    }

    status(): string {
        const mem = this.dmem;
        const route = ` route:${this.route.join(">")} sk:${(mem.skRooms || []).join(",") || "-"}`;
        const core = this.paused && mem.coreRoom ? ` core:${mem.coreRoom}` : "";
        return super.status() + ` depot:${this.depot}` + route + core;
    }
}
