import { Mission, MissionMemory } from "mission";
import { register, Priority, Service } from "process";
import { Scout } from "job.scout";
import { Wicktwo, kStagedRange, Boost } from "job.wicktwo";
import { Ballerina } from "job.ballerina";
import { FlagExtra, createFlagAt } from "flag";
import { roomCenterPos, RoomIntel, myUsername } from "intel";
import { defaultRewalker, fromXY, toXY } from "Rewalker";
import { findStaging } from "staging";
import { militantsIn } from "creep.enemy";
import { dist } from "routes";
import { theRadar } from "radar";
import * as debug from "debug";

// AssaultTwo <room> <home>: take down a two-tower room with one boosted
// wick at a time (job.wicktwo.ts) from the home room's spawns and labs.
// Scheduled by hand, or by an Assault <room> <home> mission (ms.assault.ts)
// once it has seen the room has two towers.
//
//   scheduleService('AssaultTwo W27S2 W27S4')
//   getService('AssaultTwo W27S2 W27S4').status()
//   getService('AssaultTwo W27S2 W27S4').boostRanged = true   // XKHO2 on the ranged parts too (persisted)
//
// Staging (memory.staging): of the target's neighbours, the one that is
// not unsafe (unsafeStaging: a room the Rewalker prices as a hostile base,
// towers seen or a deployed core, or one another player owns that has not
// been seen for a creep's lifetime) with the shortest Rewalker route from
// home (a staging room set by hand is kept; until 31 Oct 2026 it was the
// room before the target on the route home, which for W26S2 behind W26S3
// was not a neighbour at all, and then any foreign-owned neighbour was
// skipped, which sent W26S1's wick round an 11-room highway loop to W26S0
// while towerless W26S2 lay next door). The staging position (memory.stagexy) comes from the
// staging locator (staging.ts findStaging) over the listed targets the
// first time the target room is in sight, and the path's entry tile into
// the target room (memory.entryxy) orders the towers: the one nearest the
// way in first. Flags: Assault (AssaultN when taken, memory.flag) at the
// target's intel centre and its child staging_<flag> at the staging
// position, each made when missing and put back when found outside its
// room; nudge them by hand within their rooms. The flags' secondary colour
// shows the mode: yellow plan, orange stage or retreat, red attack, purple
// pause. Blue, set by hand, holds the mission: no mode changes, nothing
// laid, the wicks wait at the staging flag; set any other colour to let it
// run again.
//
// Targets (targets(), handed to the wick): the towers, nearest the entry
// first, then the spawns; nothing without vision.
//
// Mode (memory.mode), decided every tick (switchMode):
//   plan: no staging position yet (needs the target in sight).
//   pause: the target is in safe mode with more than kSafeResume ticks
//     left (remembered from the last sight as memory.safeUntil). Every
//     creep is handed to the nearest other AssaultTwo not paused
//     (nearestSibling, by room route), or told to recycle at home when
//     there is none (memory.recycle, read by the wick).
//   retreat: a nuke lands in the target room within kNukeTicks
//     (memory.nukeAt from the last sight). The wicks fall back to the
//     staging flag.
//   stage: otherwise, from any of the above, and while the safe mode's
//     last kSafeResume ticks run out. The wicks mass at the staging flag.
//   attack: from stage once the staging room has been in sight with no
//     militant creep (creep.enemy.ts isMilitant, keepers excepted) for
//     kQuiet ticks (memory.quietSince) and a wick waits within kStagedRange
//     of the staging flag, with the target out of safe mode; back to stage
//     once no fighter is left alive, so a replacement stages too.
// Laying (recruit), never while paused, planning or held: one Wicktwo
// while the room has a tower (nJobs 1: a replacement when the last dies),
// only while the home holds the boosts a wick wants (boostsInStock); once
// the room is tower-free and out of safe mode, one Ballerina (the wick on
// the Crow body, unboosted) in its place once no wick is left, and a Scout
// to draw the fire and stomp construction sites. The home labs are asked
// for the boosts every tick while the target has a tower, so they stay
// loaded between wicks. Done (finish) once the target has no owned
// structure left but ramparts and the unbreakable kinds: every creep to
// the nearest sibling, then windDown.
//
// Vision: theRadar.observeNow for the target and observeBackground for the
// staging room every tick while the radar has an observer; without one a
// Scout from home while the target is out of sight.
type Mode = "plan" | "stage" | "attack" | "retreat" | "pause";

export interface AssaultMemory extends MissionMemory {
    staging?: string
    route?: string[]
    flag?: string
    mode?: Mode
    // Packed xy of the staging position and the room it was found for
    // (a staging room changed by hand drops it), and the packed xy of the
    // path's first tile in the target room.
    stagexy?: number
    stageRoom?: string
    entryxy?: number
    // First tick the staging room was seen with no militant creep.
    quietSince?: number
    // The tick the target's safe mode ends, and the tick its earliest nuke
    // lands, as last seen.
    safeUntil?: number
    nukeAt?: number
    boostRanged?: boolean
    // Paused with no sibling to take the creeps: they recycle.
    recycle?: boolean
}

const kFlagName = "Assault";
const kModeColor: { [m in Mode]: ColorConstant } = {
    plan: COLOR_YELLOW,
    stage: COLOR_ORANGE,
    retreat: COLOR_ORANGE,
    attack: COLOR_RED,
    pause: COLOR_PURPLE,
};
// The staging room must be clear of militants this long before an attack.
const kQuiet = 5;
// A safe mode with this many ticks left or fewer lets the mission stage.
const kSafeResume = 400;
// A nuke landing within this many ticks sends the wicks back.
const kNukeTicks = 75;
const kLogPace = 100;
// Owned structure types that do not count toward finishing: ramparts by
// the user's rule, the rest cannot be destroyed.
const kKept: StructureConstant[] = [STRUCTURE_RAMPART, STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR,
    STRUCTURE_PORTAL, STRUCTURE_POWER_BANK, STRUCTURE_INVADER_CORE];

const rewalker = defaultRewalker();

@register
export class AssaultTwo extends Mission {
    get roomName() {
        return this.args[1];
    }

    get mem(): AssaultMemory {
        return this.memory as AssaultMemory;
    }

    getRoomName(alias = "") {
        if (alias === "home" || alias === "spawn") return this.args[2] || null;
        if (alias === "staging") return this.mem?.staging || null;
        return super.getRoomName(alias);
    }

    get mode(): Mode {
        return this.mem?.mode || "plan";
    }

    get boostRanged(): boolean {
        return !!this.mem?.boostRanged;
    }

    set boostRanged(on: boolean) {
        this.mem.boostRanged = on;
    }

    get recycling(): boolean {
        return !!this.mem?.recycle;
    }

    get flag(): FlagExtra | null {
        const name = this.mem?.flag;
        return name && (Game.flags[name] as FlagExtra) || null;
    }

    get stagingFlag(): FlagExtra | null {
        return this.flag?.getChild("staging") || null;
    }

    // Held by hand: the mission flag's secondary colour is blue.
    get manual(): boolean {
        return this.flag?.secondaryColor === COLOR_BLUE;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        this.ensureStaging();
        if (!this.observe()) this.scout();
        if (this.finished()) {
            // The fighters go on to the nearest sibling rather than dying
            // on nothing (wicktwo2 had 1000 ticks and its boosts left when
            // W26S3 was cleared, 31 Oct 2026).
            const sibling = this.nearestSibling();
            debug.log(this.name, "nothing owned left in", this.roomName, "but ramparts; winding down",
                sibling ? `, creeps to ${sibling.name}` : "");
            if (sibling) this.donateAll(sibling);
            this.windDown();
            return super.run();
        }
        this.locate();
        this.placeFlags();
        this.watchStaging();
        this.watchTarget();
        if (this.manual) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "held by the blue flag; mode", this.mode);
            super.run();
            return "normal";
        }
        this.switchMode();
        this.colour();
        if (this.mode === "pause") {
            this.handOff();
        } else {
            delete this.mem.recycle;
            if (this.mode !== "plan") this.recruit();
            this.askBoosts();
        }
        super.run();
        return "normal";
    }

    // --- rooms and flags ---

    // Another player's room, by intel: owned (reserved does not count).
    static foreignOwned(roomName: string): boolean {
        const intel = RoomIntel.get(roomName);
        if (!intel) return false;
        const owner = intel.owner;
        return !!owner && owner !== myUsername() && (intel.rcl || 0) > 0;
    }

    // Not a room to stage in: priced as a hostile base by the Rewalker
    // (towers seen, a deployed core), or another player's that has not
    // been seen within a creep's lifetime (its towers may be unseen). A
    // towerless owned room is as good as a reserved one.
    static unsafeStaging(roomName: string): boolean {
        if (rewalker.unsafeRoom(roomName)) return true;
        if (!AssaultTwo.foreignOwned(roomName)) return false;
        return (RoomIntel.get(roomName)?.staleness ?? Infinity) > CREEP_LIFE_TIME;
    }

    // The staging room: the target's neighbour that is not unsafe
    // (unsafeStaging; any neighbour when every one is) with the shortest
    // Rewalker route from home; the target itself when it has no exits. A
    // staging room set by hand is kept (set memory.staging and delete
    // memory.route; the staging position follows). memory.route is the
    // walk from the target through it to home, for status.
    ensureStaging() {
        const mem = this.mem;
        if (mem.staging && mem.route) return;
        const home = this.getRoomName("home") || this.roomName;
        if (!mem.staging) {
            const exits = _.values<string>(Game.map.describeExits(this.roomName) || {});
            const open = exits.filter(r => !AssaultTwo.unsafeStaging(r));
            const pool = open.length ? open : exits;
            mem.staging = pool.length ? _.min(pool, r => rewalker.getRouteDist(home, r)) as string : this.roomName;
            delete mem.stagexy;
            delete mem.entryxy;
        }
        mem.route = _.uniq([this.roomName, ...rewalker.getRoute(mem.staging, home)]);
        debug.log(this.name, "staging", mem.staging, "route", mem.route.join(">"));
    }

    // The staging position, once, from the staging locator over the listed
    // targets, so it needs the target in sight; logged when there is none.
    locate() {
        const mem = this.mem;
        if (mem.stagexy !== undefined && mem.stageRoom !== mem.staging) {
            debug.log(this.name, "staging room", mem.stageRoom, "->", mem.staging, "; staging position dropped");
            delete mem.stagexy;
            delete mem.entryxy;
        }
        if (mem.stagexy !== undefined) return;
        const targets = this.targets();
        if (!targets.length) {
            if (Game.time % kLogPace === 0) debug.log(this.name, this.room ? "no targets in" : "no vision of", this.roomName, "; staging unplaced");
            return;
        }
        const found = findStaging(mem.staging!, targets.map(t => t.pos));
        if (!found) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "staging locator found no path from", mem.staging, "to the targets");
            return;
        }
        mem.stagexy = toXY(found.pos);
        mem.stageRoom = mem.staging;
        if (found.entry) mem.entryxy = toXY(found.entry);
        debug.log(this.name, "staging at", found.pos, "edge", found.edge, "entry", found.entry, "path", found.path.length);
    }

    get stagePos(): RoomPosition | null {
        const mem = this.mem;
        return mem.stagexy === undefined ? null : fromXY(mem.stagexy, mem.staging!);
    }

    get entryPos(): RoomPosition | null {
        const mem = this.mem;
        return mem.entryxy === undefined ? null : fromXY(mem.entryxy, this.roomName);
    }

    // Assault, else Assault1, ...: a flag of that name in the target room
    // no other AssaultTwo claims is adopted, else the first free name.
    pickFlagName(): string {
        const claimed = new Set<string>();
        for (const name in Memory.missions) {
            if (name !== this.name && name.startsWith("AssaultTwo ")) {
                const f = (Memory.missions[name] as AssaultMemory).flag;
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

    // The mission flag at the target's centre, the staging flag at the
    // staging position: made when missing, moved back when out of its room.
    placeFlags() {
        const mem = this.mem;
        if (!mem.flag) mem.flag = this.pickFlagName();
        const center = roomCenterPos(this.roomName);
        const flag = this.flag;
        const colour = kModeColor[this.mode];
        if (!flag) {
            const err = createFlagAt(center.roomName, center.x, center.y, mem.flag, COLOR_RED, colour);
            debug.log(this.name, "flag", mem.flag, "at", center, err);
            return;
        }
        if (flag.pos.roomName !== this.roomName) {
            debug.log(this.name, "flag", flag.name, "back from", flag.pos, "to", center, flag.setPosition(center));
        }
        const pos = this.stagePos;
        if (!pos) return;
        const child = this.stagingFlag;
        if (child && child.pos.roomName === mem.staging) return;
        if (child) {
            debug.log(this.name, "staging flag back from", child.pos, "to", pos, child.setPosition(pos));
        } else {
            debug.log(this.name, "staging flag at", pos, flag.makeChild("staging", pos, colour));
        }
    }

    // Both flags' secondary colour follows the mode (never while blue).
    colour() {
        const want = kModeColor[this.mode];
        for (const flag of [this.flag, this.stagingFlag]) {
            if (flag && flag.secondaryColor !== want) flag.setColor(flag.color, want);
        }
    }

    // --- watching ---

    // The target and the staging room through the radar; false without an
    // observer.
    observe(): boolean {
        if (!theRadar.observers.size) return false;
        theRadar.observeNow(this.roomName);
        const staging = this.mem.staging;
        if (staging && staging !== this.roomName) theRadar.observeBackground(staging);
        return true;
    }

    scout() {
        if (!this.room) this.nJobs(Scout, 1);
    }

    // Count the ticks the staging room has been seen clear of militants;
    // out of sight or with one there the count starts over.
    watchStaging() {
        const mem = this.mem;
        const room = mem.staging && Game.rooms[mem.staging];
        if (!room || militantsIn(room).length) {
            delete mem.quietSince;
            return;
        }
        if (mem.quietSince === undefined) mem.quietSince = Game.time;
    }

    get quiet(): boolean {
        const since = this.mem.quietSince;
        return since !== undefined && Game.time - since >= kQuiet;
    }

    // Remember the target's safe mode and nukes while it is in sight.
    watchTarget() {
        const room = this.room;
        if (!room) return;
        const mem = this.mem;
        const ctrl = room.controller;
        const safe = ctrl && !ctrl.my ? ctrl.safeMode || 0 : 0;
        if (safe) mem.safeUntil = Game.time + safe;
        else delete mem.safeUntil;
        const nukes = room.find(FIND_NUKES);
        if (nukes.length) mem.nukeAt = Game.time + _.min(nukes.map(n => n.timeToLand));
        else delete mem.nukeAt;
    }

    // Ticks of safe mode left in the target, as last seen.
    get safeTicks(): number {
        return Math.max(0, (this.mem.safeUntil || 0) - Game.time);
    }

    // A nuke lands within kNukeTicks, as last seen.
    get nukeSoon(): boolean {
        const at = this.mem.nukeAt;
        return at !== undefined && at - Game.time <= kNukeTicks;
    }

    // The towers of the target, nearest the entry tile first (the room
    // centre when there is none), then the spawns.
    // Empty without vision. Cached for the tick.
    private _targets?: [number, Structure[]];
    targets(): Structure[] {
        if (this._targets && this._targets[0] === Game.time) return this._targets[1];
        const room = this.room;
        let list: Structure[] = [];
        if (room) {
            // In the target room: a range to the staging flag would be Infinity.
            const from = this.entryPos || roomCenterPos(this.roomName);
            const structs = room.find(FIND_HOSTILE_STRUCTURES);
            const towers = _.sortBy(structs.filter(s => s.structureType === STRUCTURE_TOWER), t => from.getRangeTo(t));
            const spawns = structs.filter(s => s.structureType === STRUCTURE_SPAWN);
            list = [...towers, ...spawns];
        }
        this._targets = [Game.time, list];
        return list;
    }

    // Vision and no hostile tower among the targets.
    get towerFree(): boolean {
        return !!this.room && !_.any(this.targets(), s => s.structureType === STRUCTURE_TOWER);
    }

    // Nothing owned left in the target but the kinds in kKept (vision).
    finished(): boolean {
        const room = this.room;
        if (!room) return false;
        return !_.any(room.find(FIND_HOSTILE_STRUCTURES), s => !_.contains(kKept, s.structureType));
    }

    // --- modes ---

    get fighters(): Creep[] {
        return _.compact([...this.roleCreeps(Wicktwo.name.toLowerCase()), ...this.roleCreeps(Ballerina.name.toLowerCase())].map(m => m.c));
    }

    // A fighter waits within kStagedRange of the staging flag.
    get staged(): boolean {
        const flag = this.stagingFlag;
        if (!flag) return false;
        return _.any(this.fighters, c => c.pos.roomName === flag.pos.roomName && c.pos.inRangeTo(flag.pos, kStagedRange));
    }

    switchMode() {
        const mode = this.mode;
        const safe = this.safeTicks;
        if (this.mem.stagexy === undefined) return this.setMode("plan", "no staging position");
        if (safe > kSafeResume) return this.setMode("pause", `safe mode ${safe} left`);
        if (this.nukeSoon) return this.setMode("retreat", `nuke lands in ${this.mem.nukeAt! - Game.time}`);
        if (mode !== "stage" && mode !== "attack") return this.setMode("stage", `from ${mode}`);
        // The last fighter gone: the next one stages and waits for the
        // quiet check again rather than walking straight in.
        if (mode === "attack" && !this.fighters.length) return this.setMode("stage", "no fighter left");
        if (mode === "stage" && !safe && this.quiet && this.staged) {
            return this.setMode("attack", `staging quiet ${Game.time - this.mem.quietSince!} ticks, wick staged`);
        }
    }

    setMode(mode: Mode, why: string) {
        if (this.mode === mode) return;
        this.mem.mode = mode;
        debug.log(this.name, "mode", mode, why);
    }

    // The nearest other AssaultTwo (by room route between targets) that is
    // neither paused nor winding down, or null.
    nearestSibling(): AssaultTwo | null {
        const others = Service.all().filter(s =>
            s instanceof AssaultTwo && s !== this && !s.dead && !s.windingDown && s.mode !== "pause") as AssaultTwo[];
        if (!others.length) return null;
        return _.min(others, o => dist(this.roomName, o.roomName)) as AssaultTwo;
    }

    // Paused: hand every creep to a sibling, else have them recycle.
    handOff() {
        const mem = this.mem;
        const sibling = this.nearestSibling();
        if (sibling) {
            delete mem.recycle;
            if (mem.eggs.length) this.purgeEggs();
            this.donateAll(sibling);
            return;
        }
        if (!mem.recycle) {
            debug.log(this.name, "paused with no sibling to take the creeps; they recycle");
            mem.recycle = true;
            this.purgeEggs();
        }
    }

    // --- laying ---

    wantedBoosts(): Boost[] {
        return Wicktwo.boosts(this.boostRanged);
    }

    // Units of `res` in the home room: terminal, storage and the labs.
    homeStock(res: ResourceConstant): number {
        const home = this.getRoom("home");
        if (!home) return 0;
        const labs = home.findStructs(STRUCTURE_LAB) as StructureLab[];
        return (home.terminal?.store[res] || 0) + (home.storage?.store[res] || 0)
            + _.sum(labs, l => l.mineralType === res ? l.mineralAmount || 0 : 0);
    }

    // Every boost a wick wants, enough for its parts, in the home room.
    boostsInStock(): boolean {
        return _.every(this.wantedBoosts(), b => this.homeStock(b.boost) >= Wicktwo.bare(Wicktwo.body, b.part) * LAB_BOOST_MINERAL);
    }

    // What the home lacks for one wick, "XGHO2:120/40" per short boost.
    boostsShort(): string {
        return this.wantedBoosts()
            .map(b => [b.boost, Wicktwo.bare(Wicktwo.body, b.part) * LAB_BOOST_MINERAL, this.homeStock(b.boost)] as [string, number, number])
            .filter(([, need, have]) => have < need)
            .map(([res, need, have]) => `${res}:${need}/${have}`).join(" ");
    }

    recruit() {
        const wick = Wicktwo.name.toLowerCase();
        if (this.towerFree && !this.safeTicks) {
            if (!this.hasRole(wick) && !this.hasEgg(wick)) this.nJobs(Ballerina, 1);
            this.nJobs(Scout, 1);
            return;
        }
        if (!this.boostsInStock()) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "home short of boosts:", this.boostsShort(), "; no wick laid");
            return;
        }
        this.nJobs(Wicktwo, 1);
    }

    // Ask the home labs for the wick's boosts whenever one may be wanted:
    // while the target has a tower and the mission is not paused, not just
    // while a wick is an egg (the first wick waited ~400 ticks at home for
    // the Chemist to drain and refill the XGHO2 lab, 31 Oct 2026). A claim
    // lasts 15 ticks, so asking every tick keeps the labs loaded between
    // wicks at the cost of two or three labs.
    askBoosts() {
        if (this.towerFree) return;
        const home = this.getRoom("home");
        if (!home) return;
        for (const b of this.wantedBoosts()) home.requestBoost(b.boost);
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
        const quiet = mem.quietSince === undefined ? "-" : String(Game.time - mem.quietSince);
        const targets = this.targets().map(t => `${t.structureType}@${t.pos.x},${t.pos.y}:${t.hits}`).join(" ") || "-";
        const wick = _.first(this.fighters);
        const boosted = wick ? _.sum(wick.body, p => p.boost ? 1 : 0) : 0;
        return super.status()
            + (this.manual ? " held(blue)" : "")
            + ` mode:${this.mode} home:${this.getRoomName("home")} staging:${mem.staging || "-"} route:${(mem.route || []).join(">") || "-"}`
            + ` flag:${mem.flag || "-"}${this.flag ? "" : "(missing)"} stagepos:${this.stagePos || "-"} entry:${this.entryPos || "-"}`
            + ` visible:${!!this.room} quiet:${quiet} staged:${this.staged} safe:${this.safeTicks} nuke:${this.nukeSoon}`
            + ` towerfree:${this.towerFree} targets:[${targets}] boosts:${this.boostsInStock() ? "ok" : "short " + this.boostsShort()}`
            + ` ranged:${this.boostRanged} wick:${wick ? `${wick.name}@${wick.pos} ${wick.hits}/${wick.hitsMax} boosted:${boosted}` : "-"}`
            + (this.recycling ? " recycling" : "") + ` observers:${theRadar.observers.size}`;
    }
}
