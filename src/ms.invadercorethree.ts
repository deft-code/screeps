import { Mission, MissionMemory } from "mission";
import { register, Priority, Service } from "process";
import { Scout } from "job.scout";
import { Boost, boostsShort, coverHits } from "job.wicktwo";
import { Coredrillthree } from "job.coredrillthree";
import { Corecleaner } from "job.corecleaner";
import { Coresweeper } from "job.coresweeper";
import { coverAt } from "job.bulldozer";
import { isActiveMilitant } from "creep.enemy";
import { FlagExtra, createFlagAt } from "flag";
import { roomCenterPos } from "intel";
import { defaultRewalker, coordsFromXY, fromXY, kInvaderUser, toXY } from "Rewalker";
import { blockHits, blockers } from "staging";
import { TStruct } from "tstruct";
import { theRadar } from "radar";
import * as debug from "debug";

// InvaderCoreThree <room> <home>: kill the level 3 invader core of a
// stronghold and carry its loot home. Scheduled by hand, or by an
// InvaderCore <room> [home] mission (ms.invadercore.ts) once it has seen
// the core's level. One sibling per core level; this is the only one yet.
//
//   scheduleService('InvaderCoreThree W4N6 W3N4')
//   getService('InvaderCoreThree W4N6 W3N4').status()
//
// The spot (memory.spotxy, findSpot): where the drill stands. A PathFinder
// flee from the core's tile to kSpotRange of it (the bunker's own tiles
// cost 1: the search tunnels out), ending on a tile a creep can stand on
// that is at least kLairRange from every keeper lair and kKeeperRange from
// every keeper tile the Rewalker tracks (SKInfo); a tile beside a rampart
// costs kMeleeCost more, since the stronghold's melee defenders hold the
// ramparts and reach one tile out. The mission flag (InvaderCore, or
// InvaderCoreN when taken; memory.flag) is put on it: secondary red while
// the core stands, yellow once it is down. Moved by hand to another tile
// within kSpotRange of the core, the flag moves the spot; anywhere else it
// is put back.
//
// coreDist (memory.coreDist): the cost of the walk from the home room's
// centre to the spot (Rewalker.planBetween, offroad: the ticks a body with
// a MOVE per part takes, swamps at 5), planned once per spot. Every lead
// time below is measured in it.
//
// While the core stands (siege):
//   One drill (drillClass: Coredrillthree, the fully boosted Wickthree
//   body) at a time, laid only while the home holds every boost for one
//   (boostsShort); the home labs are asked for the boosts while a drill is
//   an egg, hatching or still bare at home. A core that is deploying or
//   invulnerable is waited out.
//   coreEta(): the hits of the core and the rampart over it, over the shot
//   damage of the drills within range of it. Once that is coreDist +
//   kCleanerLead ticks or fewer, one Corecleaner (job.corecleaner.ts).
//   Vision through the radar; without an observer a Scout while the room
//   is out of sight.
// Once the core is gone (memory.deadAt: the room in sight with no core
// where one was; a mission scheduled late adopts the core's ruin):
//   A Scout for vision, always.
//   Loot (holders): the containers, ruins, tombstones and piles within
//   kFootprint of the core's tile that hold anything. One is open
//   (openLoot) when no foreign rampart covers it and a tile beside it can
//   be stood on.
//   Targets (planTargets, every kPlanPace ticks and the tick a listed one
//   falls; kept as TStructs): what has to come down for the loot to be
//   reached. The ramparts over the loot containers come down in any case,
//   so their tiles are free in the access matrix (accessMatrix: a blocked
//   tile costs the ticks one cleaner needs to clear it, an enemy creep on
//   a tile the ticks it has left to live: the stronghold's defenders stand
//   on their ramparts until the stronghold collapses). ruinTargets: what
//   blocks the cheapest path from the spot to a tile beside the core's own
//   tile (its ruin, or what the ruin left there), in walking order.
//   coverTargets: the container ramparts and whatever else blocks the
//   other loot. targets() lists the live ones, the ruin's first.
//   One Corecleaner while a target stands (the user's rule, 5 Nov 2026:
//   cleaners are replaced only until the loot can be reached; the last one
//   spends what life it has left on the other ramparts and the towers).
//   One Coresweeper (job.coresweeper.ts) once accessEta() is coreDist +
//   kSweeperLead or less: 0 with loot open that it would take (energy
//   counts only once nothing else is left), else the hits of the ruin's
//   targets (with none, the next cover target) over the dismantle power of
//   the cleaners in the room.
//   An armed creep that is neither the Invader's nor a keeper in the room
//   schedules Capture <room> (ms.capture.ts), once (memory.capture).
//   No loot left in sight: wind down.
//
// The stronghold's towers fire at the hostile nearest the core, which is
// the drill while it stands on the spot: drillOnSite() is what lets a
// cleaner wait inside the room.
export interface InvaderCoreMemory extends MissionMemory {
    flag?: string
    // The core's tile, level and the tick its stronghold collapses, as last seen.
    corexy?: number
    level?: number
    collapse?: number
    // The drill's tile, and the tick of the last failed try for one.
    spotxy?: number
    spotAt?: number
    // The walk cost from the home centre to the spot, and the tick of the
    // last try at planning it.
    coreDist?: number
    distAt?: number
    // The tick the core was first seen gone.
    deadAt?: number
    // The tick Capture was scheduled.
    capture?: number
}

export type Holder = StructureContainer | Ruin | Tombstone | Resource;

const kFlagName = "InvaderCore";
const kSiegeColour = COLOR_RED;
const kLootColour = COLOR_YELLOW;
// The spot: this far from the core, and no nearer than these to a keeper
// lair and to a keeper's tile.
const kSpotRange = 3;
const kLairRange = 4;
const kKeeperRange = 3;
// Added cost of a spot beside a rampart.
const kMeleeCost = 50;
const kSwampCost = 5;
// The stronghold's loot lies within this range of the core's tile.
const kFootprint = 3;
// Lead times on top of coreDist (file header).
const kCleanerLead = 100;
const kSweeperLead = 150;
// A sweeper's round trip must leave this many ticks of a lifetime.
const kTripSlack = 100;
// coreDist for a job that asks before it is planned.
const kUnknownDist = 200;
// Ticks between target plans, and between retries of a failed spot or
// distance search.
const kPlanPace = 20;
const kRetryPace = 100;
const kLogPace = 100;
// Access matrix: cost = 1 + ticks / kTickScale, so a 500k rampart (400
// cleaner ticks) costs 51 and a defender with a stronghold's life left 254.
const kTickScale = 8;
const kAccessOps = 4000;
const kNeighbours: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const rewalker = defaultRewalker();

// A tile a creep of ours could stand on: off the room's edge, not a wall,
// no foreign rampart or obstacle structure, no enemy creep. Needs vision.
export function openTile(pos: RoomPosition): boolean {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) return false;
    if (Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y) & TERRAIN_MASK_WALL) return false;
    if (_.any(pos.lookFor(LOOK_STRUCTURES), s => blockHits(s) !== null)) return false;
    return !_.any(pos.lookFor(LOOK_CREEPS), c => !c.my);
}

@register
export class InvaderCoreThree extends Mission {
    // What the mission remembers of the room's structures, as TStructs on
    // the heap (a global reset forgets them; the next sight relists them):
    // the core, and what planTargets listed.
    core: TStruct<StructureInvaderCore> | null = null;
    ruinTargets: TStruct[] = [];
    coverTargets: TStruct[] = [];
    private plannedAt = -kPlanPace;
    private _holders?: [number, Holder[]];
    private _open?: [number, Holder[]];

    get roomName() {
        return this.args[1];
    }

    get mem(): InvaderCoreMemory {
        return this.memory as InvaderCoreMemory;
    }

    getRoomName(alias = "") {
        if (alias === "home" || alias === "spawn") return this.args[2] || null;
        return super.getRoomName(alias);
    }

    // The drill this mission lays and checks boosts for; a sibling for
    // another core level overrides.
    get drillClass(): typeof Coredrillthree {
        return Coredrillthree;
    }

    get drillRole(): string {
        return this.drillClass.name.toLowerCase();
    }

    get flag(): FlagExtra | null {
        const name = this.mem?.flag;
        return name && (Game.flags[name] as FlagExtra) || null;
    }

    get corePos(): RoomPosition | null {
        const xy = this.mem?.corexy;
        return xy === undefined ? null : fromXY(xy, this.roomName);
    }

    get spotPos(): RoomPosition | null {
        const xy = this.mem?.spotxy;
        return xy === undefined ? null : fromXY(xy, this.roomName);
    }

    get coreDist(): number {
        return this.mem?.coreDist ?? kUnknownDist;
    }

    // The stronghold is too far for a sweeper's round trip (it would
    // suicide at home the tick it hatched): the mission lays nothing.
    get tooFar(): boolean {
        const dist = this.mem?.coreDist;
        return dist !== undefined && 2 * dist + kTripSlack >= CREEP_LIFE_TIME;
    }

    get coreDead(): boolean {
        return this.mem?.deadAt !== undefined;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        const observed = this.observe();
        this.watchCore();
        if (this.mem.corexy === undefined) {
            if (!observed && !this.room) this.nJobs(Scout, 1);
            if (this.room && Game.time % kLogPace === 0) debug.log(this.name, "no invader core or core ruin in", this.roomName);
            super.run();
            return "normal";
        }
        this.placeSpot();
        this.planDist();
        this.placeFlag();
        if (this.tooFar) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "coreDist", this.mem.coreDist, "leaves no round trip in a lifetime; nothing laid");
            super.run();
            return "normal";
        }
        if (this.coreDead) this.salvage();
        else this.siege(observed);
        super.run();
        return "normal";
    }

    // --- the core, the spot and the flag ---

    // The target through the radar; false without an observer.
    observe(): boolean {
        if (!theRadar.observers.size) return false;
        theRadar.observeNow(this.roomName);
        return true;
    }

    // With the room in sight: remember the core while it stands, and the
    // tick it is first found gone. A mission that never saw a core adopts
    // the tile of a core's ruin.
    watchCore() {
        const room = this.room;
        if (!room) return;
        const mem = this.mem;
        const core = _.first(room.findStructs(STRUCTURE_INVADER_CORE));
        if (core) {
            this.core = TStruct.make(core);
            mem.corexy = toXY(core.pos);
            mem.level = core.level;
            const collapse = core.effectTTL(EFFECT_COLLAPSE_TIMER);
            if (collapse > 0) mem.collapse = Game.time + collapse;
            if (mem.deadAt !== undefined) {
                debug.log(this.name, "a core stands at", core.pos, "again; back to the siege");
                delete mem.deadAt;
            }
            return;
        }
        if (mem.corexy === undefined) {
            const ruin = _.find(room.find(FIND_RUINS), r => r.structure.structureType === STRUCTURE_INVADER_CORE);
            if (!ruin) return;
            mem.corexy = toXY(ruin.pos);
        }
        if (mem.deadAt === undefined) {
            mem.deadAt = Game.time;
            debug.log(this.name, "the core at", this.corePos, "is gone; salvaging");
        }
    }

    // The spot, once (file header); a flag moved by hand moves it.
    placeSpot() {
        const mem = this.mem;
        const core = this.corePos!;
        const flag = this.flag;
        if (flag && mem.spotxy !== undefined && flag.pos.roomName === this.roomName && toXY(flag.pos) !== mem.spotxy) {
            if (flag.pos.getRangeTo(core) <= kSpotRange && !flag.pos.isEqualTo(core)) {
                debug.log(this.name, "spot moved by the flag:", this.spotPos, "->", flag.pos);
                mem.spotxy = toXY(flag.pos);
                delete mem.coreDist;
                delete mem.distAt;
            } else {
                debug.log(this.name, "flag", flag.name, "at", flag.pos, "is not within", kSpotRange, "of the core; back to", this.spotPos,
                    flag.setPosition(this.spotPos!));
            }
        }
        if (mem.spotxy !== undefined) return;
        const room = this.room;
        if (!room) return;
        if (mem.spotAt !== undefined && Game.time - mem.spotAt < kRetryPace) return;
        const pos = this.findSpot(room, core);
        if (!pos) {
            mem.spotAt = Game.time;
            debug.log(this.name, "no spot within", kSpotRange, "of the core at", core, "; next try in", kRetryPace);
            return;
        }
        delete mem.spotAt;
        mem.spotxy = toXY(pos);
        debug.log(this.name, "spot", pos, "for the core at", core);
    }

    // The flee from the core's tile (file header), or null when no tile
    // kSpotRange out will do.
    findSpot(room: Room, core: RoomPosition): RoomPosition | null {
        const name = room.name;
        const terrain = Game.map.getRoomTerrain(name);
        const lairs = room.findStructs(STRUCTURE_KEEPER_LAIR).map(s => s.pos);
        const keepers = rewalker.skInfo(name).allPos(name);
        const ramparts = room.find(FIND_HOSTILE_STRUCTURES).filter(s => s.structureType === STRUCTURE_RAMPART);
        const mat = new PathFinder.CostMatrix();
        for (let dx = -kSpotRange; dx <= kSpotRange; dx++) {
            for (let dy = -kSpotRange; dy <= kSpotRange; dy++) {
                const x = core.x + dx;
                const y = core.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                // A wall keeps its terrain cost: a matrix value would open it.
                if (terrain.get(x, y) & TERRAIN_MASK_WALL) continue;
                if (Math.max(Math.abs(dx), Math.abs(dy)) < kSpotRange) {
                    mat.set(x, y, 1);
                    continue;
                }
                const pos = new RoomPosition(x, y, name);
                const ok = x >= 1 && x <= 48 && y >= 1 && y <= 48
                    && !_.any(pos.lookFor(LOOK_STRUCTURES), s => blockHits(s) !== null)
                    && !_.any(lairs, l => pos.getRangeTo(l) < kLairRange)
                    && !_.any(keepers, k => pos.getRangeTo(k) < kKeeperRange);
                if (!ok) {
                    mat.set(x, y, 0xff);
                    continue;
                }
                const base = terrain.get(x, y) & TERRAIN_MASK_SWAMP ? kSwampCost : 1;
                mat.set(x, y, base + (_.any(ramparts, r => r.pos.isNearTo(pos)) ? kMeleeCost : 0));
            }
        }
        const ret = PathFinder.search(core, { pos: core, range: kSpotRange }, {
            flee: true,
            maxRooms: 1,
            plainCost: 1,
            swampCost: kSwampCost,
            roomCallback: n => n === name ? mat : false,
        });
        const pos = _.last(ret.path);
        if (ret.incomplete || !pos || pos.getRangeTo(core) !== kSpotRange) return null;
        return pos;
    }

    // coreDist, once per spot (file header).
    planDist() {
        const mem = this.mem;
        const spot = this.spotPos;
        if (!spot || mem.coreDist !== undefined) return;
        if (mem.distAt !== undefined && Game.time - mem.distAt < kRetryPace) return;
        mem.distAt = Game.time;
        const from = roomCenterPos(this.homeRoomName);
        const plan = rewalker.planBetween(from, spot, 0);
        if (plan.goal < 0) {
            debug.log(this.name, "no walk from", from, "to the spot", spot, "; ops", plan.ops, "steps", plan.path.length, "; next try in", kRetryPace);
            return;
        }
        mem.coreDist = Math.max(plan.cost, plan.path.length);
        debug.log(this.name, "coreDist", mem.coreDist, "from", from, "to", spot, "steps", plan.path.length);
    }

    // InvaderCore, else InvaderCore1, ...: a flag of that name in the
    // target room no other mission claims is adopted, else the first free name.
    pickFlagName(): string {
        const claimed = new Set<string>();
        for (const name in Memory.missions) {
            if (name !== this.name && name.startsWith(kFlagName)) {
                const f = (Memory.missions[name] as InvaderCoreMemory).flag;
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

    // The mission flag on the spot: made when missing, moved back when out
    // of the room, its secondary colour the phase.
    placeFlag() {
        const mem = this.mem;
        const spot = this.spotPos;
        if (!spot) return;
        if (!mem.flag) mem.flag = this.pickFlagName();
        const flag = this.flag;
        const colour = this.coreDead ? kLootColour : kSiegeColour;
        if (!flag) {
            const err = createFlagAt(spot.roomName, spot.x, spot.y, mem.flag, COLOR_RED, colour);
            debug.log(this.name, "flag", mem.flag, "at", spot, err);
            return;
        }
        if (flag.pos.roomName !== this.roomName) {
            debug.log(this.name, "flag", flag.name, "back from", flag.pos, "to", spot, flag.setPosition(spot));
        }
        if (flag.secondaryColor !== colour) flag.setColor(flag.color, colour);
    }

    // --- the siege ---

    get drills(): Coredrillthree[] {
        return this.roleCreeps(this.drillRole).filter(d => d.c) as Coredrillthree[];
    }

    // A drill of ours is in the target room.
    drillOnSite(): boolean {
        return _.any(this.drills, d => d.pos.roomName === this.roomName);
    }

    // Ticks until the core falls at the rate of the drills in range of it;
    // Infinity out of sight or with none in range.
    coreEta(): number {
        const core = this.core?.s;
        if (!core) return Infinity;
        const rate = _.sum(this.drills, d => d.pos.inRangeTo(core.pos, 3) ? d.shotDamage() : 0);
        if (!rate) return Infinity;
        return Math.ceil((core.hits + coverHits(core.pos)) / rate);
    }

    siege(observed: boolean) {
        const mem = this.mem;
        if (!observed && !this.room) this.nJobs(Scout, 1);
        this.askBoosts();
        const core = this.core?.s;
        // An expired effect may still be listed, its ticks negative.
        const waiting = core ? Math.max(core.ticksToDeploy || 0, core.effectTTL(EFFECT_INVULNERABILITY), 0) : 0;
        if (waiting > 0) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "core deploying or invulnerable for", waiting);
        } else if (this.spotPos) {
            this.recruitDrill();
        }
        if (mem.coreDist !== undefined && this.coreEta() <= mem.coreDist + kCleanerLead) this.nJobs(Corecleaner, 1);
    }

    wantedBoosts(): Boost[] {
        return this.drillClass.boosts(true);
    }

    // What the home lacks for one drill, "" when it holds every boost.
    boostsShort(): string {
        return boostsShort(this.getRoom("home"), this.drillClass.body, this.wantedBoosts());
    }

    recruitDrill() {
        const short = this.boostsShort();
        if (short) {
            if (Game.time % kLogPace === 0 && !this.drills.length) debug.log(this.name, "home short of boosts:", short, "; no drill laid");
            return;
        }
        this.nJobs(this.drillClass, 1);
    }

    // Ask the home labs for the drill's boosts while one is on its way to
    // them: an egg, a hatch, or a drill at home with bare parts. (A claim
    // lasts 15 ticks; AssaultTwo asks for the whole assault, this mission
    // only around a drill, since a siege is one drill long.)
    askBoosts() {
        const home = this.getRoom("home");
        if (!home) return;
        const role = this.drillRole;
        const waiting = this.hasEgg(role) || this.roleHatches(role).length > 0
            || _.any(this.drills, d => d.pos.roomName === home.name && !d.boosted);
        if (!waiting) return;
        for (const b of this.wantedBoosts()) home.requestBoost(b.boost, !!b.nearSpawn);
    }

    // --- the salvage ---

    salvage() {
        const mem = this.mem;
        // A drill still an egg has nothing left to shoot.
        const drill = this.drillRole;
        if (this.hasEgg(drill)) this.purgeEggs(_.uniq(this.eggs.map(e => e.role)).filter(r => r !== drill));
        this.nJobs(Scout, 1);
        const room = this.room;
        if (!room) return;
        this.watchHostiles(room);
        this.planTargets(room);
        if (!this.lootLeft()) {
            debug.log(this.name, "nothing left to carry out of", this.roomName, "; winding down");
            this.windDown();
            return;
        }
        if (mem.coreDist === undefined) return;
        if (this.targets().length) this.nJobs(Corecleaner, 1);
        if (this.accessEta() <= mem.coreDist + kSweeperLead) this.nJobs(Coresweeper, 1);
    }

    // An armed player's creep in the room: schedule a Capture, once.
    watchHostiles(room: Room) {
        const mem = this.mem;
        if (mem.capture !== undefined) return;
        const foes = (room.enemies || room.find(FIND_HOSTILE_CREEPS))
            .filter(e => isActiveMilitant(e) && !e.keeper && e.owner.username !== kInvaderUser);
        if (!foes.length) return;
        const cmd = `Capture ${this.roomName}`;
        debug.log(this.name, "hostile creeps of", _.uniq(foes.map(f => f.owner.username)).join(","), "in", this.roomName, "; scheduling", cmd);
        Service.schedule(cmd);
        mem.capture = Game.time;
    }

    // Everything within kFootprint of the core's tile that holds something
    // to carry off; empty without vision. Cached for the tick.
    holders(): Holder[] {
        if (this._holders && this._holders[0] === Game.time) return this._holders[1];
        const room = this.room;
        const core = this.corePos;
        let list: Holder[] = [];
        if (room && core) {
            const near = (o: RoomObject) => o.pos.inRangeTo(core, kFootprint);
            const stores: (StructureContainer | Ruin | Tombstone)[] = [
                ...room.findStructs(STRUCTURE_CONTAINER), ...room.find(FIND_RUINS), ...room.find(FIND_TOMBSTONES)];
            list = [
                ...stores.filter(s => near(s) && s.store.getUsedCapacity() > 0),
                ...room.find(FIND_DROPPED_RESOURCES).filter(r => near(r) && r.amount > 0),
            ];
        }
        this._holders = [Game.time, list];
        return list;
    }

    // `pos` can be looted: no foreign rampart over it and a tile beside it
    // to stand on.
    accessible(pos: RoomPosition): boolean {
        if (coverAt(pos)) return false;
        return _.any(kNeighbours, ([dx, dy]) => {
            const x = pos.x + dx;
            const y = pos.y + dy;
            return x >= 0 && x <= 49 && y >= 0 && y <= 49 && openTile(new RoomPosition(x, y, pos.roomName));
        });
    }

    // The loot a sweeper can reach now. Cached for the tick.
    openLoot(): Holder[] {
        if (this._open && this._open[0] === Game.time) return this._open[1];
        const list = this.holders().filter(h => this.accessible(h.pos));
        this._open = [Game.time, list];
        return list;
    }

    // `h` holds something other than energy.
    static otherThanEnergy(h: Holder): boolean {
        if (h instanceof Resource) return h.resourceType !== RESOURCE_ENERGY;
        const store = h.store as unknown as { [res: string]: number };
        return _.any(Object.keys(store), res => res !== RESOURCE_ENERGY && store[res] > 0);
    }

    // Open loot a sweeper would take now: energy counts only once nothing
    // else is left anywhere (Coresweeper.pick).
    takeable(): boolean {
        const open = this.openLoot();
        if (!open.length) return false;
        return _.any(open, InvaderCoreThree.otherThanEnergy) || !this.otherLootLeft();
    }

    // Loot is left; true without vision (not known to be gone).
    lootLeft(): boolean {
        return !this.room || this.holders().length > 0;
    }

    // Something other than energy is left; true without vision.
    otherLootLeft(): boolean {
        if (!this.room) return true;
        return _.any(this.holders(), InvaderCoreThree.otherThanEnergy);
    }

    // The access matrix (file header): the ticks to clear each blocked
    // tile, the ramparts on the `free` tiles left out.
    accessMatrix(room: Room, free: Set<number>): CostMatrix {
        const ticks = new Map<number, number>();
        const add = (pos: RoomPosition, t: number) => ticks.set(toXY(pos), (ticks.get(toXY(pos)) || 0) + t);
        for (const s of room.find(FIND_STRUCTURES)) {
            const hits = blockHits(s);
            if (hits === null) continue;
            if (s.structureType === STRUCTURE_RAMPART && free.has(toXY(s.pos))) continue;
            add(s.pos, hits / Corecleaner.power);
        }
        for (const c of room.find(FIND_HOSTILE_CREEPS)) add(c.pos, c.ticksToLive || CREEP_LIFE_TIME);
        const mat = new PathFinder.CostMatrix();
        for (const [xy, t] of ticks) {
            const [x, y] = coordsFromXY(xy);
            mat.set(x, y, t === Infinity ? 0xff : Math.min(0xfe, 1 + Math.round(t / kTickScale)));
        }
        return mat;
    }

    // What stands in the way of the cheapest path from `from` to a tile
    // beside `to`, in walking order; none when there is no path at all.
    pathBlockers(from: RoomPosition, to: RoomPosition, mat: CostMatrix): Structure[] {
        if (from.isNearTo(to)) return [];
        const ret = PathFinder.search(from, { pos: to, range: 1 }, {
            maxRooms: 1,
            plainCost: 1,
            swampCost: 1,
            maxOps: kAccessOps,
            roomCallback: n => n === to.roomName ? mat : false,
        });
        if (ret.incomplete) {
            debug.log(this.name, "no access path from", from, "to", to, "; ops", ret.ops);
            return [];
        }
        return _.flatten(ret.path.map(p => blockers(p)));
    }

    // List the targets (file header): paced, and at once when one fell.
    planTargets(room: Room) {
        const fell = _.any([...this.ruinTargets, ...this.coverTargets], t => !t.s);
        if (!fell && Game.time - this.plannedAt < kPlanPace) return;
        this.plannedAt = Game.time;
        const core = this.corePos!;
        const from = this.spotPos || core;
        const holders = this.holders();
        const covers = _.compact(holders.filter(h => h instanceof StructureContainer).map(h => coverAt(h.pos))) as Structure[];
        const mat = this.accessMatrix(room, new Set(covers.map(r => toXY(r.pos))));
        const ruin = _.any(holders, h => h.pos.isEqualTo(core)) ? this.pathBlockers(from, core, mat) : [];
        const rest: Structure[] = [];
        for (const h of _.sortBy(holders.filter(h => !h.pos.isEqualTo(core)), h => from.getRangeTo(h.pos))) {
            const cover = coverAt(h.pos);
            if (cover) rest.push(cover);
            rest.push(...this.pathBlockers(from, h.pos, mat));
        }
        const before = this.targets().length;
        this.ruinTargets = _.uniq(ruin, s => s.id).map(s => TStruct.make(s));
        this.coverTargets = _.uniq(rest, s => s.id).filter(s => !_.any(ruin, r => r.id === s.id)).map(s => TStruct.make(s));
        if (this.targets().length !== before) {
            debug.log(this.name, "targets:", this.targetNotes() || "none");
        }
    }

    // The structures still to come down, the ruin's access first; empty
    // without vision.
    targets(): Structure[] {
        return _.compact([...this.ruinTargets, ...this.coverTargets].map(t => t.s)) as Structure[];
    }

    targetNotes(): string {
        const note = (t: TStruct) => `${t.pos.x},${t.pos.y}:${t.s?.hits ?? "-"}`;
        return `ruin[${this.ruinTargets.map(note).join(" ")}] cover[${this.coverTargets.map(note).join(" ")}]`;
    }

    // Ticks until a sweeper has something to take (file header).
    accessEta(): number {
        if (this.takeable()) return 0;
        const ruin = _.compact(this.ruinTargets.map(t => t.s)) as Structure[];
        const next = ruin.length ? ruin : _.compact(this.coverTargets.map(t => t.s)).slice(0, 1) as Structure[];
        const hits = _.sum(next, s => s.hits);
        if (!hits) return Infinity;
        const cleaners = this.roleCreeps(Corecleaner.name.toLowerCase()).filter(k => k.c && k.pos.roomName === this.roomName);
        const rate = _.sum(cleaners, k => k.c.getActiveBodyparts(WORK) * DISMANTLE_POWER);
        return rate ? Math.ceil(hits / rate) : Infinity;
    }

    // The flag goes with the mission (evolve() kills too).
    kill() {
        const flag = this.flag;
        if (flag) flag.remove();
        super.kill();
    }

    status(): string {
        const mem = this.mem;
        if (!mem) return super.status();
        const core = this.core?.s;
        const drill = _.first(this.drills);
        const eta = (n: number) => n === Infinity ? "-" : String(n);
        const loot = this.holders().map(h => {
            const what = h instanceof Resource ? "pile" : h instanceof StructureContainer ? "cont" : h instanceof Ruin ? "ruin" : "tomb";
            const amount = h instanceof Resource ? h.amount : h.store.getUsedCapacity();
            return `${this.accessible(h.pos) ? "open" : "shut"}:${what}@${h.pos.x},${h.pos.y}:${amount}`;
        }).join(" ");
        return super.status()
            + ` home:${this.getRoomName("home")} level:${mem.level ?? "?"} core:${this.corePos || "-"}`
            + (this.coreDead ? ` dead:${Game.time - mem.deadAt!}` : ` hits:${core ? core.hits + "+" + coverHits(core.pos) : "?"} eta:${eta(this.coreEta())}`)
            + ` collapse:${mem.collapse ? mem.collapse - Game.time : "?"} spot:${this.spotPos || "-"} flag:${mem.flag || "-"}${this.flag ? "" : "(missing)"}`
            + ` coreDist:${mem.coreDist ?? "?"} visible:${!!this.room} observers:${theRadar.observers.size}`
            + ` boosts:${this.boostsShort() ? "short " + this.boostsShort() : "ok"}`
            + ` drill:${drill ? `${drill.name}@${drill.pos} ${drill.c.hits}/${drill.c.hitsMax} ttl:${drill.c.ticksToLive}` : "-"}`
            + (this.coreDead ? ` targets:${this.targetNotes()} accessEta:${eta(this.accessEta())} loot:[${loot || "-"}]` : "")
            + (mem.capture ? ` capture:${Game.time - mem.capture}` : "");
    }
}
