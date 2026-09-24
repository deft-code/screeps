import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Immortan } from "job.immortan";
import { Guard } from "job.guard";
import { Toxic } from "job.toxic";
import { Warboy } from "job.warboy";
import { Warrunner } from "job.warrunner";
import { sectorCore, findReactors, thoriumMineral } from "reactor";
import { RoomIntel } from "intel";
import { MyCreep } from "mycreep";

// Ticks of one warboy round trip: ~250 harvesting (rate per WORK cancels
// against carry per CARRY), plus the walk both ways. Tune from observation.
const kWarboyCycle = 700;

// The reactor holds 1000 thorium and burns 1 a tick. A warboy laid now lands
// about kLeadTicks later (~110 to spawn once the room has the energy, ~300
// to fill, 120-290 to walk), by when the reactor has burned that much and
// every load already in flight, from either mission, has arrived. Lay only
// if a full load still fits then; a warboy that would land too late leaves
// early instead (Warboy.reactorNeedsUs).
const kReactorCapacity = 1000;
const kLeadTicks = 600;

// Keep an Immortan standing by while our reactor holds more thorium than
// this: fuel worth re-claiming on the spot if someone takes the reactor.
const kGuardAbove = 100;

// One scout per this many ticks keeps the core in view between warboy trips;
// a fresh one is laid before the last (1500-tick) one dies.
const kScoutPace = 1400;

// An invader core (level > 0) in the room where one of our creeps just died
// pauses all laying for this long: the survivors die off and the next egg,
// the scout, probes the core again; dying to it renews the pause.
const kCorePause = 1500;

export interface ReactorMemory extends MissionMemory {
    // Lay nothing until this tick.
    pauseUntil?: number
    // creep name -> room it was last seen in, for creepDied.
    seen?: { [name: string]: string }
}

// A job class that carries thorium to the reactor (Warboy, Warrunner).
export interface RunnerClass {
    new(name: string): MyCreep
    readonly name: string
    readonly tripLoad: number
}

// Thorium a runner of role `role` carries per trip, 0 for any other role.
function tripLoadOf(role: string): number {
    for (const klass of [Warboy, Warrunner]) {
        if (role.startsWith(klass.name.toLowerCase())) return klass.tripLoad;
    }
    return 0;
}

// Thorium on its way to the reactor from every Reactor and ReactorDepot
// mission: what each living runner carries (a full load if it is still at
// home filling up) and a full load for each egg. Missions share one reactor,
// so this must look past the calling mission.
export function inboundThorium(): number {
    let total = 0;
    for (const name in Memory.missions) {
        if (!name.startsWith("Reactor ") && !name.startsWith("ReactorDepot ")) continue;
        const home = name.split(" ")[1];
        const mem = Memory.missions[name];
        for (const list of [mem.eggs, mem.hatch]) {
            total += _.sum(list, n => tripLoadOf(n));
        }
        for (const cname of mem.creeps) {
            const load = tripLoadOf(cname);
            if (!load) continue;
            const c = Game.creeps[cname];
            if (!c) continue;
            const carried = RESOURCE_THORIUM && c.store[RESOURCE_THORIUM] || 0;
            total += c.pos.roomName === home ? Math.max(carried, load) : carried;
        }
    }
    return total;
}

// Tick each mission last dumped its probe; module-level so it resets with the global.
const lastProbe = new Map<string, number>();

// Schedule from the console:
//   scheduleService('Reactor W6N8')     // args[1]=home room: spawns come from here, its
//                                       // sector core is the mission room
//   scheduleService('Reactor W6N8 2')   // optional args[2]=cap on the number of warboys
@register
export class Reactor extends Mission {
    // The room named in the command; also the scout's spawn room.
    get homeName() {
        return this.args[1];
    }

    // The mission room is the sector core, not the room on the command line.
    get roomName() {
        return sectorCore(this.homeName) || this.homeName;
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.homeName;
        return super.getRoomName(alias);
    }

    get mem(): ReactorMemory {
        return this.memory as ReactorMemory;
    }

    get paused(): boolean {
        return (this.mem.pauseUntil || 0) > Game.time;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        this.noteRooms();
        this.watch();
        if (this.paused) {
            // Shepherd the living, lay nothing (but what whilePaused allows).
            this.whilePaused();
            super.run();
            return "normal";
        }

        // A scout parked at the core keeps it visible so hold() and fuel()
        // can read the reactor even with no warboy in the room.
        this.paceJobs(Scout, kScoutPace);
        if (this.room) {
            this.probe();
            this.guard();
            this.toxic();
            this.hold();
            this.fuel();
        }
        super.run();
        return "normal";
    }

    // Hooks for subclasses: something to check every tick before the pause
    // gate (ReactorDepot watches the SK rooms on its route), and what may
    // still be laid while paused (nothing here).
    watch() { }
    whilePaused() { }

    // Remember where each living creep is, so creepDied knows where it fell.
    noteRooms() {
        const seen = this.mem.seen = this.mem.seen || {};
        for (const name of this.memory.creeps) {
            const c = Game.creeps[name];
            if (c) seen[name] = c.pos.roomName;
        }
    }

    // A creep of ours died: if the room it died in has an invader core (per
    // that room's intel, written while the creep still gave us vision), stop
    // laying for kCorePause ticks and drop any egg already queued.
    creepDied(name: string) {
        const seen = this.mem.seen || {};
        const roomName = seen[name];
        delete seen[name];
        if (!roomName) return;
        const lvl = RoomIntel.get(roomName)?.coreLvl || 0;
        if (lvl <= 0) return;
        this.mem.pauseUntil = Game.time + kCorePause;
        this.purgeEggs();
        debug.log(this.name, name, "died in", roomName, "with a level", lvl, "invader core; pausing until", this.mem.pauseUntil);
    }

    // Enemy creeps in the core (strat.init's room.enemies: anything not ours
    // or allied, armed or not, so a rival claimer counts): keep one Guard
    // there until they are gone.
    guard() {
        if (!this.enemies.length) return null;
        return this.nJobs(Guard, 1);
    }

    // An armed enemy with no HEAL part cannot outlast a bait: keep one Toxic
    // (job.toxic.ts, bait-and-trap mini) per lifetime while one is in the core.
    // Healers are left to the guard.
    toxic() {
        if (!_.any(this.hostiles, h => !h.getActiveBodyparts(HEAL))) return null;
        return this.paceNJobs(Toxic, 1);
    }

    // Enemy creeps in the core this tick; empty without vision.
    get enemies(): Creep[] {
        return this.room?.enemies || [];
    }

    // The armed ones (strat.init's room.hostiles): what a warboy must not meet.
    get hostiles(): Creep[] {
        return this.room?.hostiles || [];
    }

    // CLAIM creeps are expensive, so an Immortan is laid only when we can see
    // the reactor and either it is not ours (anyone can re-claim it, so this
    // also covers taking it back after a loss) or it is ours and fuelled past
    // kGuardAbove, so a loss can be reversed before the fuel is burned for
    // someone else.
    hold() {
        const reactor = this.reactors[0];
        if (!reactor) return null;
        const fuel = RESOURCE_THORIUM && reactor.store[RESOURCE_THORIUM] || 0;
        if (reactor.my && fuel <= kGuardAbove) return null;
        return this.nJobs(Immortan, 1);
    }

    // Optional cap on runners from the schedule command; Infinity when absent.
    get maxRunnersArg() {
        return Number(this.args[2]) || Infinity;
    }

    // Hooks for ReactorDepot: which job carries the thorium, how long one of
    // its round trips takes, how long a fresh egg takes to land, and whether
    // the home room has thorium for it to carry.
    get runnerClass(): RunnerClass {
        return Warboy;
    }
    get runnerCycle(): number {
        return kWarboyCycle;
    }
    get leadTicks(): number {
        return kLeadTicks;
    }
    // Warboys mine: a thorium mineral with an extractor and thorium left.
    homeHasThorium(home: Room): boolean {
        return !!thoriumMineral(home);
    }

    // Enough runners in flight to deliver 1 thorium per tick, the reactor's
    // burn rate: each delivers tripLoad per runnerCycle ticks. Only while the
    // home room has thorium for them (homeHasThorium), the core is visible
    // (the scout's job) with no armed hostile in it (an enemy scout only draws
    // the guard), and the reactor will have room for another full load when
    // it lands.
    fuel() {
        const home = this.getRoom("home");
        if (!home || !this.homeHasThorium(home)) return null;
        const reactor = this.reactors[0];
        if (!reactor) return null;
        if (this.hostiles.length) return null;
        const runner = this.runnerClass;
        const stored = RESOURCE_THORIUM && reactor.store[RESOURCE_THORIUM] || 0;
        const atLanding = stored - this.leadTicks + inboundThorium();
        if (atLanding + runner.tripLoad > kReactorCapacity) return null;
        const n = Math.min(this.maxRunnersArg, this.runnerCycle / runner.tripLoad);
        return this.nJobs(runner as unknown as typeof MyCreep, n);
    }

    // Reactors in the core room; the seasonal server should have exactly one.
    get reactors(): ReactorObject[] {
        const room = this.room;
        return room ? findReactors(room) : [];
    }

    // Once a global reset (or every 500 ticks) log what the core's reactor
    // looks like so we can learn how it behaves.
    probe() {
        const room = this.room!;
        const last = lastProbe.get(this.name);
        if (last !== undefined && Game.time - last < 500) return;
        lastProbe.set(this.name, Game.time);
        const reactors = this.reactors;
        if (!reactors.length) {
            debug.log(this.name, "no reactor in", room.name, "structures:",
                JSON.stringify(_.countBy(room.find(FIND_STRUCTURES), s => s.structureType)));
            return;
        }
        for (const r of reactors) {
            debug.log(this.name, "reactor", r.id, r.pos, "owner:", r.owner?.username,
                "work:", r.continuousWork, "store:", JSON.stringify(r.store),
                "cap:", RESOURCE_THORIUM && r.store.getCapacity(RESOURCE_THORIUM),
                "effects:", JSON.stringify(r.effects));
        }
    }

    status(): string {
        const r = this.reactors[0];
        const state = r ? ` owner:${r.owner?.username ?? "-"} work:${r.continuousWork}` : "";
        const pause = this.paused ? ` paused:${this.mem.pauseUntil! - Game.time}` : "";
        return super.status() + ` core:${this.roomName} visible:${!!this.room} reactors:${this.reactors.length}${state}${pause}`;
    }
}
