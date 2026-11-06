import { Mission, MissionMemory } from "mission";
import { register, Priority, Service } from "process";
import { Scout } from "job.scout";
import { Wicktwo, kStagedRange, Boost, homeStock, boostNeed, boostsShort } from "job.wicktwo";
import { Wickthree } from "job.wickthree";
import { Ballerina } from "job.ballerina";
import { FlagExtra, createFlagAt } from "flag";
import { roomCenterPos, RoomIntel, myUsername } from "intel";
import { defaultRewalker, fromXY, toXY } from "Rewalker";
import { findStaging, hitsMatrix, blockers, Staging } from "staging";
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
// first, then the spawns; nothing without vision. A shielded room puts its
// breach ahead of them (below).
//
// Shields (1 Nov 2026): a room walled in so that the staging locator finds
// no path to the targets is shielded. locate() then asks the locator again
// over the hits-weighted matrix (staging.ts hitsMatrix: a blocked tile
// costs log10(hits) * 20, the Bulldoze breach's pricing), takes the staging
// position and entry from that path, and lists its tiles in the target room
// that something blocks, in walking order, as memory.breach. What stands
// on those tiles (staging.ts blockers: the rampart first, then the wall or
// structure under it) heads the target list, so the wick shoots its way
// along the path. watchBreach() drops cleared tiles each tick and replans
// every kBreachPace ticks or once the list is empty: a plain path open
// again ends the breach, else a new one is listed (repairs, new walls).
// The staging position is kept across replans. Cleared tiles stay watched
// for kClearedTTL ticks (memory.cleared): a blocker back on one, the
// rampart rebuilt, relists it the next tick with no search. `wicks`
// (persisted setter) is how many wicks are kept alive; one wick cannot
// out-shoot a shield that is repaired between wicks.
//
// The wick class (wickClass, Wicktwo here) is what AssaultThree
// (ms.assaultthree.ts) swaps for the Wickthree: the body and boosts the
// stock checks use, the job laid, and the roles counted as fighters (both
// wicks and the Ballerina, so a donated wick of the other kind counts).
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
    // Shielded: packed xys of the target-room tiles on the breach path that
    // something blocks, in walking order; and the tick of the last breach
    // plan or plain-path check (watchBreach paces both by it).
    breach?: number[]
    breachAt?: number
    // Breach tiles cleared within kClearedTTL ticks: a blocker back on one
    // (a rampart rebuilt) relists it the next tick, no search.
    cleared?: number[]
    clearedAt?: number
    // Wicks kept alive (the `wicks` setter), default kWicks.
    wicks?: number
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
// Ticks between breach replans while shielded; PathFinder ops for the
// weighted search (high costs make A* look wider).
const kBreachPace = 200;
const kBreachOps = 50000;
// Ticks between plain-path checks while unshielded (a shield can close again).
const kRecheckPace = 25;
// How long a cleared breach tile is watched for a rebuilt blocker.
const kClearedTTL = 1500;
const kWicks = 1;
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

    // The wick this mission lays and checks boosts for; AssaultThree
    // overrides.
    get wickClass(): typeof Wicktwo {
        return Wicktwo;
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

    // Wicks kept alive while the target has a tower; persisted. One cannot
    // out-shoot a shield the enemy repairs between wicks (W28N1, 1 Nov
    // 2026: the breach rampart came back to 167k in the gap).
    get wicks(): number {
        return this.mem?.wicks ?? kWicks;
    }

    set wicks(n: number) {
        this.mem.wicks = Math.max(1, Math.floor(n));
        debug.log(this.name, "wicks:", this.mem.wicks);
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
        this.watchBreach();
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
        const targets = this.baseTargets();
        if (!targets.length) {
            if (Game.time % kLogPace === 0) debug.log(this.name, this.room ? "no targets in" : "no vision of", this.roomName, "; staging unplaced");
            return;
        }
        let found = findStaging(mem.staging!, targets.map(t => t.pos));
        if (found) {
            delete mem.breach;
            mem.breachAt = Game.time;
        } else {
            // The weighted search is the dear one (kBreachOps): one try per
            // kBreachPace while it keeps failing (planBreach stamps the try).
            if (mem.breachAt !== undefined && Game.time - mem.breachAt < kBreachPace) return;
            found = this.planBreach(targets);
            if (!found) {
                debug.log(this.name, "staging locator found no path from", mem.staging, "to the targets, shielded or not; next try in", kBreachPace);
                return;
            }
        }
        mem.stagexy = toXY(found.pos);
        mem.stageRoom = mem.staging;
        if (found.entry) mem.entryxy = toXY(found.entry);
        debug.log(this.name, "staging at", found.pos, "edge", found.edge, "entry", found.entry, "path", found.path.length, mem.breach ? "shielded" : "");
    }

    // The locator over the hits-weighted matrix of the target room alone
    // (file header; the other rooms keep the Rewalker's pricing): the path
    // the wick shoots its way along, its blocked target-room tiles listed
    // in walking order as memory.breach. null when even that finds no path.
    // Every try is stamped in memory.breachAt, found or not, to pace the
    // next.
    planBreach(targets: Structure[]): Staging | null {
        const mem = this.mem;
        mem.breachAt = Game.time;
        const matrix = (name: string) => name === this.roomName ? hitsMatrix(name) : undefined;
        const found = findStaging(mem.staging!, targets.map(t => t.pos), { matrix, maxOps: kBreachOps });
        if (!found) return null;
        const tiles = found.path.filter(p => p.roomName === this.roomName && blockers(p).length);
        mem.breach = tiles.map(toXY);
        debug.log(this.name, "shielded: breach of", tiles.length, "tiles:", tiles.map(p => `${p.x},${p.y}`).join(" "));
        return found;
    }

    // Shielded: drop the breach tiles cleared, and replan the tick the list
    // empties and every kBreachPace ticks. Unshielded, with the staging
    // placed: every kRecheckPace ticks make sure a plain path still reaches
    // the targets, and list a breach when it does not (W28N1 rebuilt its
    // breach rampart the tick it fell and the wick, its breach forgotten,
    // walked out of the room to go round, 1 Nov 2026). Vision needed.
    watchBreach() {
        const mem = this.mem;
        if (!this.room || mem.stagexy === undefined) return;
        this.watchCleared();
        if (mem.breach) {
            const before = mem.breach.length;
            const gone = _.remove(mem.breach, xy => !blockers(fromXY(xy, this.roomName)).length);
            if (gone.length) {
                debug.log(this.name, "breach: cleared", gone.length, "tiles,", mem.breach.length, "left");
                mem.cleared = _.uniq([...(mem.cleared || []), ...gone]);
                mem.clearedAt = Game.time;
            }
            const emptied = before > 0 && !mem.breach.length;
            if (!emptied && Game.time - (mem.breachAt || 0) < kBreachPace) return;
        } else if (Game.time - (mem.breachAt || 0) < kRecheckPace) {
            return;
        }
        const targets = this.baseTargets();
        if (!targets.length) return;
        if (findStaging(mem.staging!, targets.map(t => t.pos))) {
            if (mem.breach) debug.log(this.name, "breach: a plain path reaches the targets again; shield down");
            delete mem.breach;
            mem.breachAt = Game.time;
            return;
        }
        this.planBreach(targets);
    }

    // A blocker back on a tile cleared within kClearedTTL (the enemy
    // rebuilt the rampart) goes to the head of the breach at once.
    watchCleared() {
        const mem = this.mem;
        if (!mem.cleared) return;
        if (Game.time - (mem.clearedAt || 0) > kClearedTTL) {
            delete mem.cleared;
            delete mem.clearedAt;
            return;
        }
        const back = mem.cleared.filter(xy => blockers(fromXY(xy, this.roomName)).length);
        if (!back.length) return;
        mem.breach = _.uniq([...back, ...(mem.breach || [])]);
        mem.breachAt = Game.time;
        debug.log(this.name, "breach: rebuilt on", back.map(xy => `${Math.floor(xy / 100)},${xy % 100}`).join(" "), "; relisted");
    }

    get shielded(): boolean {
        return !!this.mem?.breach;
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
            if (name !== this.name && name.startsWith("Assault")) {
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

    // The breach's blockers in walking order (shielded), then the towers of
    // the target, nearest the entry tile first (the room centre when there
    // is none), then the spawns; each once. Empty without vision. Cached
    // for the tick.
    private _targets?: [number, Structure[]];
    targets(): Structure[] {
        if (this._targets && this._targets[0] === Game.time) return this._targets[1];
        const list = this.room ? _.uniq([...this.breachTargets(), ...this.baseTargets()], s => s.id) : [];
        this._targets = [Game.time, list];
        return list;
    }

    // The towers nearest the entry first, then the spawns (vision).
    baseTargets(): Structure[] {
        const room = this.room;
        if (!room) return [];
        // In the target room: a range to the staging flag would be Infinity.
        const from = this.entryPos || roomCenterPos(this.roomName);
        const structs = room.find(FIND_HOSTILE_STRUCTURES);
        const towers = _.sortBy(structs.filter(s => s.structureType === STRUCTURE_TOWER), t => from.getRangeTo(t));
        const spawns = structs.filter(s => s.structureType === STRUCTURE_SPAWN);
        return [...towers, ...spawns];
    }

    // What stands on the listed breach tiles, in walking order (vision).
    breachTargets(): Structure[] {
        const breach = this.mem.breach;
        if (!breach || !this.room) return [];
        return _.flatten(breach.map(xy => blockers(fromXY(xy, this.roomName))));
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

    // Every wick kind and the Ballerina: a donated wick of the other kind
    // fights too.
    get fighters(): Creep[] {
        const roles = _.uniq([this.wickClass.name, Wicktwo.name, Wickthree.name, Ballerina.name].map(n => n.toLowerCase()));
        return _.compact(_.flatten(roles.map(r => this.roleCreeps(r))).map(m => m.c));
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
        return this.wickClass.boosts(this.boostRanged);
    }

    // Units of `res` in the home room: terminal, storage and the labs.
    homeStock(res: ResourceConstant): number {
        return homeStock(this.getRoom("home"), res);
    }

    // Units of `b` one wick of ours takes.
    boostNeed(b: Boost): number {
        return boostNeed(this.wickClass.body, b);
    }

    // Every boost a wick wants, enough for its parts, in the home room.
    boostsInStock(): boolean {
        return !this.boostsShort();
    }

    // What the home lacks for one wick, "XGHO2:120/40" per short boost.
    boostsShort(): string {
        return boostsShort(this.getRoom("home"), this.wickClass.body, this.wantedBoosts());
    }

    recruit() {
        const wick = this.wickClass.name.toLowerCase();
        if (this.towerFree && !this.safeTicks) {
            if (!this.hasRole(wick) && !this.hasEgg(wick)) this.nJobs(Ballerina, 1);
            this.nJobs(Scout, 1);
            return;
        }
        if (!this.boostsInStock()) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "home short of boosts:", this.boostsShort(), "; no wick laid");
            return;
        }
        this.nJobs(this.wickClass, this.wicks);
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
        for (const b of this.wantedBoosts()) home.requestBoost(b.boost, !!b.nearSpawn);
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
        const breach = (mem.breach ? ` shielded breach:${mem.breach.length} planned:${Game.time - (mem.breachAt || 0)}` : "")
            + (mem.cleared ? ` cleared:${mem.cleared.length}` : "") + ` wicks:${this.wicks}`;
        return super.status()
            + (this.manual ? " held(blue)" : "")
            + ` wick:${this.wickClass.name} mode:${this.mode}${breach} home:${this.getRoomName("home")} staging:${mem.staging || "-"} route:${(mem.route || []).join(">") || "-"}`
            + ` flag:${mem.flag || "-"}${this.flag ? "" : "(missing)"} stagepos:${this.stagePos || "-"} entry:${this.entryPos || "-"}`
            + ` visible:${!!this.room} quiet:${quiet} staged:${this.staged} safe:${this.safeTicks} nuke:${this.nukeSoon}`
            + ` towerfree:${this.towerFree} targets:[${targets}] boosts:${this.boostsInStock() ? "ok" : "short " + this.boostsShort()}`
            + ` ranged:${this.boostRanged} wick:${wick ? `${wick.name}@${wick.pos} ${wick.hits}/${wick.hitsMax} boosted:${boosted}` : "-"}`
            + (this.recycling ? " recycling" : "") + ` observers:${theRadar.observers.size}`;
    }
}
