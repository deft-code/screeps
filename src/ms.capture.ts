import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import { Scout } from "job.scout";
import { Crow } from "job.crow";
import { FlagExtra, createFlagAt } from "flag";
import { roomCenterPos } from "intel";
import { defaultRewalker } from "Rewalker";
import { dist } from "routes";
import * as debug from "debug";
import type { CreepMove } from "creep.move";

// Capture <room>: take a room off whoever holds it with a force of Crows
// (job.crow.ts: 25 MOVE, 24 RANGED_ATTACK, 1 HEAL), massed in the room
// before it and sent in together.
//
//   scheduleService('Capture W25S5')      // args[1]=target room
//   getService('Capture W25S5').status()
//
// On its first run it picks and keeps (memory.home) the owned room at RCL7
// or above, with a spawn, nearest the target by room route; every crow and
// scout spawns there, and the home room's observer (if any) is its eyes.
// The staging room (memory.staging) is the next room back from the target
// along the Rewalker route to home.
//
// Flags: a flag named Capture (CaptureN when that is taken, memory.flag) at
// the target room's intel centre (roomCenterPos), and its child
// staging_<flag> kStageTiles tiles into the staging room along the path
// from the target centre to the home centre. Either flag is left where it
// is while it stays in its room (nudge them by hand), put back when it is
// found in another room, and re-created when it is gone. kill() removes
// both.
//
// Ranged attack power is active RANGED_ATTACK parts x RANGED_ATTACK_POWER
// (boosts and towers are not counted). The enemy's is measured from the
// target room's enemy creeps (room.enemies, Source Keepers excepted) while
// it is visible and remembered (memory.power) for the blind ticks. One crow
// egg at a time is laid while the crows' power (every living crow's active
// parts, a full crow for each hatch and egg) is not more than the enemy's:
// an empty or unknown room draws one crow, since 0 is not more than 0.
//
// Mode (memory.mode), read by the crows:
//   staging (the start): crows wait at the staging flag. Once the power of
//     the crows within kStagedRange of that flag is more than the enemy's,
//     attack.
//   attack: crows fight in the target room as Guards, holding near the
//     mission flag when nothing is left to fight or heal. Once the power
//     available (crows in the target room or the staging room: the ones on
//     their way in, or fallen back to heal) is under half the enemy's,
//     staging again, and the crows pull back to the staging flag.
//
// Vision: with an observer in the home room within OBSERVER_RANGE of the
// target, each tick it observes the target room while that is out of
// sight, else the staging room while that is, else one of the target's
// neighbours in turn. Without one, nJobs(Scout, 1) from home while the
// target is out of sight (the scout parks there).
type Mode = "staging" | "attack";

interface CaptureMemory extends MissionMemory {
    // The RCL7+ room the crows spawn in, chosen once.
    home?: string
    // The room before the target on the route home.
    staging?: string
    // Name of the mission flag; the staging flag is its "staging" child.
    flag?: string
    mode?: Mode
    // Enemy ranged attack power last measured in the target room, and when.
    power?: number
    powerAt?: number
}

const kMinHomeRCL = 7;
// The staging flag goes this many tiles into the staging room.
const kStageTiles = 5;
// Crows within this range of the staging flag count toward the attack.
const kStagedRange = 5;
const kFlagName = "Capture";
const kLogPace = 100;
// Path search from the target centre to the home centre (stagingPos):
// offroad costs, a generous op budget for a few rooms.
const kPathPlain = 1;
const kPathSwamp = 5;
const kPathOps = 20000;

const rewalker = defaultRewalker();

// Active RANGED_ATTACK power of `creeps`.
export function rangedPower(creeps: Creep[]): number {
    return _.sum(creeps, c => ((c as CreepMove).activeByType.get(RANGED_ATTACK) || 0) * RANGED_ATTACK_POWER);
}

@register
export class Capture extends Mission {
    get roomName() {
        return this.args[1];
    }

    get mem(): CaptureMemory {
        return this.memory as CaptureMemory;
    }

    // "home" and "spawn" are the chosen home room (JobCreep.homeName,
    // JobRole.stratSpawn and Scout.spawn pin the eggs to it); "staging" the
    // staging room.
    getRoomName(alias = "") {
        if (alias === "home" || alias === "spawn") return this.mem?.home || null;
        if (alias === "staging") return this.mem?.staging || null;
        return super.getRoomName(alias);
    }

    get mode(): Mode {
        return this.mem?.mode || "staging";
    }

    get flag(): FlagExtra | null {
        const name = this.mem?.flag;
        return name && (Game.flags[name] as FlagExtra) || null;
    }

    get stagingFlag(): FlagExtra | null {
        return this.flag?.getChild("staging") || null;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        if (!this.ensureHome()) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "no owned room at RCL", kMinHomeRCL, "or above with a spawn; laying nothing");
            super.run();
            return "normal";
        }
        this.ensureStaging();
        this.placeFlags();
        this.measure();
        this.switchMode();
        if (!this.observe()) this.scout();
        this.recruit();
        super.run();
        return "normal";
    }

    // The home room: kept while it is still ours, else (first run, or the
    // room was lost) the owned RCL7+ room with a spawn nearest the target by
    // route length (routes.dist). False when there is none.
    ensureHome(): boolean {
        const mem = this.mem;
        if (mem.home && Game.rooms[mem.home]?.controller?.my) return true;
        const rooms = _.filter(Game.rooms, r =>
            !!r.controller?.my && r.controller.level >= kMinHomeRCL && r.find(FIND_MY_SPAWNS).length > 0);
        if (!rooms.length) return false;
        const home = _.min(rooms, r => dist(this.roomName, r.name)) as Room;
        mem.home = home.name;
        delete mem.staging;
        debug.log(this.name, "home", home.name, "rcl", home.controller!.level, "route", dist(this.roomName, home.name));
        return true;
    }

    // The staging room: the room after the target on the Rewalker route to
    // home (the target itself when home is the target).
    ensureStaging() {
        const mem = this.mem;
        if (mem.staging) return;
        const route = rewalker.getRoute(this.roomName, mem.home!);
        mem.staging = route.length > 1 ? route[1] : this.roomName;
        debug.log(this.name, "staging", mem.staging, "route", route.join(">"));
    }

    // The mission flag at the target's centre and the staging flag on the
    // path home, each made when missing and moved only when out of its room.
    placeFlags() {
        const mem = this.mem;
        if (!mem.flag) mem.flag = this.pickFlagName();
        const center = roomCenterPos(this.roomName);
        const flag = this.flag;
        if (!flag) {
            // The child waits a tick: makeChild wants a parent in Game.flags.
            const err = createFlagAt(center.roomName, center.x, center.y, mem.flag, COLOR_RED, COLOR_RED);
            debug.log(this.name, "flag", mem.flag, "at", center, err);
            return;
        }
        if (flag.pos.roomName !== this.roomName) {
            debug.log(this.name, "flag", flag.name, "back from", flag.pos, "to", center, flag.setPosition(center));
        }
        const child = this.stagingFlag;
        if (child && child.pos.roomName === mem.staging) return;
        const pos = this.stagingPos();
        if (!pos) return;
        if (child) {
            debug.log(this.name, "staging flag back from", child.pos, "to", pos, child.setPosition(pos));
        } else {
            debug.log(this.name, "staging flag at", pos, flag.makeChild("staging", pos, COLOR_RED));
        }
    }

    // Capture, else Capture1, Capture2, ... : a flag of that name already in
    // the target room that no other Capture claims is adopted; otherwise the
    // first name no flag has.
    pickFlagName(): string {
        const claimed = new Set<string>();
        for (const name in Memory.missions) {
            if (name !== this.name && name.startsWith("Capture ")) {
                const f = (Memory.missions[name] as CaptureMemory).flag;
                if (f) claimed.add(f);
            }
        }
        for (let i = 0; ; i++) {
            const name = i ? kFlagName + i : kFlagName;
            const flag = Game.flags[name];
            if (!flag) return name;
            if (flag.pos.roomName === this.roomName && !claimed.has(name)) return name;
        }
    }

    // Where the staging flag goes: kStageTiles tiles into the staging room
    // along a path from the target's centre to the home's centre, through
    // the rooms of the Rewalker route and over its matrices (a shorter stay
    // in the staging room ends at its last tile there). The staging room's
    // centre when the search does not pass through it.
    stagingPos(): RoomPosition | null {
        const mem = this.mem;
        const staging = mem.staging!;
        const allowed = rewalker.getRouteSet(this.roomName, mem.home!);
        const ret = PathFinder.search(roomCenterPos(this.roomName), { pos: roomCenterPos(mem.home!), range: 1 }, {
            plainCost: kPathPlain,
            swampCost: kPathSwamp,
            maxRooms: allowed.size,
            maxOps: kPathOps,
            roomCallback: name => allowed.has(name) ? rewalker.getMatrix(name) : false,
        });
        const tiles = ret.path.filter(p => p.roomName === staging);
        if (!tiles.length) {
            debug.log(this.name, "no path through", staging, "to", mem.home, "incomplete:", ret.incomplete, "ops:", ret.ops, "; staging flag at its centre");
            return roomCenterPos(staging);
        }
        return tiles[Math.min(kStageTiles, tiles.length) - 1];
    }

    // Enemy creeps in the target room this tick (Source Keepers excepted).
    get enemies(): Creep[] {
        return (this.room?.enemies || []).filter(e => !e.keeper);
    }

    // Remember the enemy's ranged power while the room is visible.
    measure() {
        if (!this.room) return;
        const mem = this.mem;
        mem.power = rangedPower(this.enemies);
        mem.powerAt = Game.time;
    }

    // Enemy ranged power: measured now with vision, else as last seen (0
    // for a room never seen).
    get enemyPower(): number {
        if (this.room) return rangedPower(this.enemies);
        return this.mem.power || 0;
    }

    get crows(): Creep[] {
        return _.compact(this.roleCreeps(Crow.name.toLowerCase()).map(m => m.c));
    }

    // Every crow's power, a full crow for each hatch and egg.
    get ourPower(): number {
        const role = Crow.name.toLowerCase();
        const pending = this.roleHatches(role).length + this.roleEggs(role).length;
        return rangedPower(this.crows) + pending * Crow.power;
    }

    // Power of the crows within kStagedRange of the staging flag.
    get stagedPower(): number {
        const flag = this.stagingFlag;
        if (!flag) return 0;
        return rangedPower(this.crows.filter(c => c.pos.roomName === flag.pos.roomName && c.pos.inRangeTo(flag.pos, kStagedRange)));
    }

    // Power of the crows in the target room or the staging room.
    get availablePower(): number {
        const staging = this.mem.staging;
        return rangedPower(this.crows.filter(c => c.pos.roomName === this.roomName || c.pos.roomName === staging));
    }

    switchMode() {
        const enemy = this.enemyPower;
        if (this.mode === "staging") {
            const staged = this.stagedPower;
            if (staged > enemy) this.setMode("attack", `staged ${staged} vs enemy ${enemy}`);
        } else {
            const available = this.availablePower;
            if (available < enemy / 2) this.setMode("staging", `available ${available} vs enemy ${enemy}`);
        }
    }

    setMode(mode: Mode, why: string) {
        if (this.mode === mode) return;
        this.mem.mode = mode;
        debug.log(this.name, "mode", mode, why);
    }

    // The home room's observer, when it can reach the target.
    get observer(): StructureObserver | null {
        const home = this.getRoom("home");
        if (!home) return null;
        if (Game.map.getRoomLinearDistance(home.name, this.roomName) > OBSERVER_RANGE) return null;
        return (_.first(home.findStructs(STRUCTURE_OBSERVER)) as StructureObserver | undefined) || null;
    }

    // Point the observer (observeTarget); false without one.
    observe(): boolean {
        const ob = this.observer;
        if (!ob) return false;
        const target = this.observeTarget();
        if (target) {
            const err = ob.observeRoom(target);
            if (err !== OK) debug.log(this.name, "observeRoom", target, "failed", err);
        }
        return true;
    }

    // The target room while out of sight, else the staging room while out
    // of sight, else the target's unseen neighbours in turn; null when all
    // of those are visible.
    observeTarget(): string | null {
        if (!this.room) return this.roomName;
        const staging = this.mem.staging;
        if (staging && !Game.rooms[staging]) return staging;
        const around = _.values<string>(Game.map.describeExits(this.roomName)).filter(n => !Game.rooms[n]);
        if (!around.length) return null;
        return around[Game.time % around.length];
    }

    // No observer: a scout from home while the target is out of sight.
    scout() {
        if (!this.room) this.nJobs(Scout, 1);
    }

    // One crow egg at a time while our power is not more than the enemy's.
    recruit() {
        const role = Crow.name.toLowerCase();
        if (this.hasEgg(role)) return;
        const ours = this.ourPower;
        const enemy = this.enemyPower;
        if (ours > enemy) return;
        debug.log(this.name, "laying a crow: ours", ours, "vs enemy", enemy);
        this.layEgg(role);
    }

    // The flags go with the mission (evolve() kills too).
    kill() {
        for (const flag of [this.stagingFlag, this.flag]) {
            if (flag) flag.remove();
        }
        super.kill();
    }

    status(): string {
        const mem = this.mem;
        if (!mem) return super.status();
        const seen = this.room ? "" : mem.powerAt === undefined ? "(never seen)" : `(seen ${Game.time - mem.powerAt} ago)`;
        return super.status()
            + ` mode:${this.mode} home:${mem.home || "-"} staging:${mem.staging || "-"}`
            + ` flag:${mem.flag || "-"}${this.flag ? "" : "(missing)"} stagingflag:${this.stagingFlag ? this.stagingFlag.pos : "-"}`
            + ` visible:${!!this.room} power:${this.ourPower}/${this.enemyPower}${seen}`
            + ` staged:${this.stagedPower} available:${this.availablePower} observer:${!!this.observer}`;
    }
}
