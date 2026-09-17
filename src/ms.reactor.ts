import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Immortan } from "job.immortan";
import { Guard } from "job.guard";
import { Warboy } from "job.warboy";
import { sectorCore, findReactors, thoriumMineral } from "reactor";
import { RoomIntel } from "intel";

// Ticks of one warboy round trip: ~250 harvesting (rate per WORK cancels
// against carry per CARRY), plus the walk both ways. Tune from observation.
const kWarboyCycle = 700;

// The reactor holds 1000 thorium and burns 1 a tick. Lay no warboy while it
// still has this much aboard: a load arriving at a nearly full reactor waits
// beside it, aging 3 ticks to live per tick for nothing.
const kRefuelBelow = 500;

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

interface ReactorMemory extends MissionMemory {
    // Lay nothing until this tick.
    pauseUntil?: number
    // creep name -> room it was last seen in, for creepDied.
    seen?: { [name: string]: string }
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
        if (this.paused) {
            // Shepherd the living, lay nothing.
            super.run();
            return "normal";
        }

        // A scout parked at the core keeps it visible so hold() and fuel()
        // can read the reactor even with no warboy in the room.
        this.paceJobs(Scout, kScoutPace);
        if (this.room) {
            this.probe();
            this.guard();
            this.hold();
            this.fuel();
        }
        super.run();
        return "normal";
    }

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

    // Optional cap on warboys from the schedule command; Infinity when absent.
    get maxWarboysArg() {
        return Number(this.args[2]) || Infinity;
    }

    // Enough warboys in flight to deliver 1 thorium per tick, the reactor's
    // burn rate: each delivers tripLoad per kWarboyCycle ticks. Only while the
    // home room can actually mine thorium (a thorium mineral with an extractor
    // and thorium left), the core is visible (the scout's job) with no armed
    // hostile in it (an enemy scout only draws the guard), and its reactor has
    // room for a load (under kRefuelBelow).
    fuel() {
        const home = this.getRoom("home");
        if (!home || !thoriumMineral(home)) return null;
        const reactor = this.reactors[0];
        if (!reactor) return null;
        if (this.hostiles.length) return null;
        if (RESOURCE_THORIUM && (reactor.store[RESOURCE_THORIUM] || 0) >= kRefuelBelow) return null;
        const n = Math.min(this.maxWarboysArg, kWarboyCycle / Warboy.tripLoad);
        return this.nJobs(Warboy, n);
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
