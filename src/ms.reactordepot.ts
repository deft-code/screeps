import { register, Service } from "process";
import * as debug from "debug";
import type { Capture } from "ms.capture";
import { Reactor, ReactorMemory, RunnerClass } from "ms.reactor";
import { Warrunner } from "job.warrunner";
import { Scout } from "job.scout";
import { defaultRewalker } from "Rewalker";
import { roomKind, Kind, RoomIntel } from "intel";

// The depot switches on once the home terminal holds this much thorium
// (memory.active, persisted) and off again under kDepotOff: a wide band, so
// a trickle from the Thormines does not flip the warrunners (and the
// capture that follows them) on and off every few hundred ticks. While off
// the whole mission is held as pause() holds it: nothing is laid, scouts
// included, and the eggs are purged the tick it flips off. 1000 both ways
// until 14 Oct 2026, on at 10000 until 15 Oct 2026, at 25000 until 20 Oct
// 2026, at 10000 (with scouts, guard and immortan still laid while off)
// until 27 Oct 2026.
const kDepotOn = 25000;
const kDepotOff = 500;

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
    // The Capture mission of our core (`Capture <core>`), found once among
    // the scheduled services and kept.
    capture?: string
    // We paused that capture because we went cold (syncCapture).
    coldPaused?: boolean
    // The depot is on: reached kDepotOn thorium and not yet under kDepotOff.
    active?: boolean
}

const rewalker = defaultRewalker();

// Reactor fed from a terminal instead of a mine: everything ms.reactor does
// (scout for vision, probe, guard against enemies, immortan holding the
// reactor, invader-core pause) but the thorium runner is a Warrunner that
// loads from the home room's terminal, and all of it only while the depot
// is active: on once that terminal holds kDepotOn thorium, off again under
// kDepotOff (Thormine ships it there, ms.thormine.ts). An inactive depot
// holds the mission the way pause() does (`paused` below): nothing laid,
// scouts included, the living shepherded to their deaths, the capture
// paused by syncCapture once no runner is about.
//
// The route the runners walk (Rewalker.getRoute home -> core, refreshed every
// kRoutePace ticks) is kept in memory with its Source Keeper rooms. Every
// tick each SK room on the route we can see is checked for an invader core;
// one with a level pauses everything but scouts for kSkCorePause ticks,
// purging the other eggs. Scouts keep walking the route (paceJobs while
// paused), so their vision, or their death in a room whose intel shows a
// core, renews the pause until the core is cleared or collapses.
//
// The core's Capture mission (`Capture <core>`, memory.capture once found
// among the scheduled services) follows the depot: the tick the depot goes
// cold (the depot inactive with no warrunner alive, hatching or queued,
// so the reactor is about to run dry) the capture is paused, and the tick
// the depot is active again it is resumed (syncCapture, every tick, held
// or not). Only a pause of ours is
// undone (memory.coldPaused); one set by hand stays.
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

    // Always one warrunner, its replacement laid while it still has
    // kLeadTicks to live. The duty cycle (300 / 450 of a runner) would pace
    // one egg per 2250 ticks, but a runner ages 3x while loaded and lasts
    // three trips, about 900 ticks: 0.6 thorium a tick against a burn of 1
    // (Oct 2026). One runner at a time delivers ~1.8; fuel()'s landing check
    // holds the next egg back while the reactor is too full for it.
    get runnerCount(): number {
        return 1 + kLeadTicks / CREEP_LIFE_TIME;
    }

    // Thorium in the home terminal, 0 without one or without vision.
    get depot(): number {
        const term = this.getRoom("home")?.terminal;
        return term && RESOURCE_THORIUM ? term.store[RESOURCE_THORIUM] || 0 : 0;
    }

    // The depot's switch, with its band: on at kDepotOn, off under
    // kDepotOff, remembered in between. Logged on each flip.
    get active(): boolean {
        const mem = this.dmem;
        const depot = this.depot;
        if (mem.active && depot < kDepotOff) {
            mem.active = false;
            this.purgeEggs();
            debug.log(this.name, "depot off at", depot, "thorium (under", kDepotOff + "); holding the mission");
        } else if (!mem.active && depot >= kDepotOn) {
            mem.active = true;
            debug.log(this.name, "depot on at", depot, "thorium (", kDepotOn, "reached)");
        }
        return !!mem.active;
    }

    homeHasThorium(home: Room): boolean {
        return this.active;
    }

    // An inactive depot holds the mission like pause(): run() lays nothing
    // (whilePaused below keeps its scouts for the core pause only) and
    // shepherds the living. A hand pause() or a core pause still count.
    get paused(): boolean {
        return this.held || this.corePaused || !this.active;
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

    // The Capture mission of our core: the scheduled `Capture <core>`,
    // remembered once seen; null while none is scheduled or it is gone.
    get capture(): Capture | null {
        const mem = this.dmem;
        if (!mem.capture) {
            const name = `Capture ${this.roomName}`;
            if (!_.contains(Memory.scheduler?.services || [], name)) return null;
            mem.capture = name;
            debug.log(this.name, "following capture", name);
        }
        const cap = Service.getType<Capture>(mem.capture);
        if (!cap) {
            delete mem.capture;
            return null;
        }
        return cap;
    }

    // A warrunner alive, hatching or queued: thorium still on its way.
    get runnersAbout(): boolean {
        const role = Warrunner.name.toLowerCase();
        return this.roleCreeps(role).length + this.roleHatches(role).length + this.roleEggs(role).length > 0;
    }

    // Out of thorium: the depot off and nobody carrying any.
    get cold(): boolean {
        return !this.active && !this.runnersAbout;
    }

    // Pause the core's capture while cold, resume it once warm again.
    syncCapture() {
        const cap = this.capture;
        if (!cap) return;
        const mem = this.dmem;
        if (this.cold) {
            if (mem.coldPaused) return;
            mem.coldPaused = true;
            debug.log(this.name, "cold (depot", this.depot + "); pausing", cap.name);
            cap.pause();
        } else if (mem.coldPaused) {
            delete mem.coldPaused;
            debug.log(this.name, "warm again (depot", this.depot + "); resuming", cap.name);
            cap.resume();
        }
    }

    // Every tick: the capture follows the depot, and each visible SK room on
    // the route is looked at for an invader core.
    watch() {
        this.syncCapture();
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

    // Scouts still go out during a core pause: their walk through the SK
    // rooms is how the core is watched, and their deaths renew the pause.
    // Not while the depot holds the mission: nothing is laid then.
    whilePaused() {
        if (this.active) this.paceJobs(Scout, kScoutPace);
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
        const core = this.corePaused && mem.coreRoom ? ` core:${mem.coreRoom}` : "";
        const cap = mem.capture ? ` capture:${mem.capture}${this.cold ? " cold" : ""}${mem.coldPaused ? " paused" : ""}` : "";
        return super.status() + ` depot:${this.depot}${this.active ? " on" : " off holding"}` + route + core + cap;
    }
}
