import { JobCreep } from "job.creep";
import { register, Task2Ret } from "mycreep";
import type { CreepMove } from "creep.move";
import { isActiveMilitant, militantsIn } from "creep.enemy";
import { healIdle, healSelf } from "heal";
import { defaultRewalker, positionAtDirection } from "Rewalker";
import type { AssaultTwo } from "ms.assaulttwo";

// Wick: the AssaultTwo mission's fighter (ms.assaulttwo.ts), a boosted
// ranged creep that stands in tower fire and heals through it. Body 4
// TOUGH, 25 MOVE, 12 RANGED_ATTACK, 9 HEAL (5340 energy), TOUGH first so
// damage lands on the boosted parts, HEAL last so the heals die last.
// Boosts: XGHO2 on the TOUGH (damage x0.3), XLHO2 on the HEAL (x4), and
// XKHO2 on the RANGED_ATTACK only when the mission's boostRanged switch is
// on (off while commissioning). Two towers at close range deal 1200 raw,
// ~360 through the boosted TOUGH, under the 432 the boosted heals restore.
//
// Spawned only in the mission's home room (readySpawn), where it stays
// until every wanted boost is on: each tick it asks the room's labs for
// the missing boosts (room.requestBoost; the Chemist loads them, the
// mission asks too while the wick is an egg) and takes one from a lab that
// holds enough. The mission lays no wick while the home is short of boosts
// (AssaultTwo.boostsInStock).
//
// Then, by the mission's mode:
//   stage / retreat / plan / pause, or the flag held blue: walk to the
//     staging flag and wait within kStagedRange of it; a militant creep in
//     the staging room is engaged (ranged, kiting melee) while there.
//   attack: in the target room. A working melee enemy within kDanger is
//     fled to kFleeTo (shots still fire). Otherwise the walk goes to the
//     first of the mission's listed targets (towers, then spawns), or with
//     none listed to a target of the wick's own: the militant creep with
//     the least hits (its own plus any rampart over it), else the
//     structure with the least hits (never a road; containers only once
//     nothing else is left; walls count), each kept as a plain property
//     here (creepId, structId: a global reset forgets them, which is fine)
//     and dropped the tick the mission lists targets again.
//   recycling (the mission paused with no sibling to take us): back to
//     the origin spawn to be recycled.
// Firing (after(), one ranged intent a tick), the ladder: (1) the first
// listed target within 3; (2) else the nearest militant creep within 3 not
// under a rampart over kRampartSkip hits, active ones before inactive; a
// focus at range 1 is mass-attacked when the mass attack does at least a
// shot's damage (it hits the focus for the same and everything else
// besides); (3) else mass attack when its total damage beats a shot at (4)
// the structure within 3 with the least hits. Outside the target room only
// militant creeps are shot (Source Keepers never).
// A foreign room in safe mode blocks every action of ours but moving,
// healing included, while its towers fire on (wicktwo0 died in W28S1 that
// way, 31 Oct 2026): escape() leaves such a room by the nearest exit, a
// PathFinder step a tick, before anything else. While a hostile tower
// stands in the target room the spawns are spared (never the focus, never
// the weakest structure, no mass attack with one within 3): both trial
// rooms popped safe mode the tick their spawn took damage, and a wick
// that cannot heal under towers is lost; the spawn's turn comes once the
// towers are gone.
// Healing (after()): self every tick while a tower with energy is in the
// room or the wick is hurt; else the idle cascade (heal.ts healIdle:
// adjacent hurt friendly, rangedHeal within 3), ending in self-heal while
// an enemy creep is within 3.
//
// The base of the wick family (1 Nov 2026): Wickthree (job.wickthree.ts)
// is this job on a heavier body with its MOVEs boosted, Ballerina
// (job.ballerina.ts) on the Crow body unboosted; each overrides the
// statics (body, boosts, spawnNearLabs) and nothing else. The mission's
// wickClass names which one it lays. What the statics drive:
//   boosts(ranged): the wanted list in the order taken; a MOVE boost at
//     its head is taken before any other (boost(): the hatchling waits at
//     that lab alone, slow until it is on) and asked for a lab beside a
//     spawn (Boost.nearSpawn: struct.lab.js findBoostLab).
//   spawnNearLabs: spawn() prefers a home spawn with a lab within
//     kLabRange, and spawnDirections() (read by the spawn daemon) steps the
//     hatchling out toward the lab holding or claimed for its first boost.
// Standing beside a structure target (fight()), reposition(): of the
// tiles within 1 of the target and one step from us that we could stand
// on, and our own, the one where a mass attack deals the most
// (massDamage(pos)); moved to when it deals as much as here or more (the
// user's rule, 1 Nov 2026: equal moves too, so two equal tiles may trade
// places tick by tick, which costs a ranged creep nothing). The secondary damage on
// everything around the target stays as high as the ground allows while
// its ramparts come down.
const kTough = 4;
const kMoves = 25;
const kRanged = 12;
const kHeals = 9;
export const kToughBoost: MineralBoostConstant = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
export const kHealBoost: MineralBoostConstant = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
export const kRangedBoost: MineralBoostConstant = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
// A working melee enemy within kDanger is fled from, to kFleeTo.
const kDanger = 2;
const kFleeTo = 3;
// Range to close to on a ranged or unarmed creep target.
const kEngageRange = 2;
// A creep under a rampart over this many hits is not shot through it.
const kRampartSkip = 10000;
const kShotRange = 3;
// Wait within this range of the staging flag (AssaultTwo kStagedRange too).
export const kStagedRange = 5;
const kHoldRange = 3;
// A spawn with a lab within this range suits a wick that boosts its MOVEs.
export const kLabRange = 2;
const kDirections: DirectionConstant[] = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
// Structure types a wick never shoots.
const kIgnored: StructureConstant[] = [STRUCTURE_ROAD, STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR,
    STRUCTURE_PORTAL, STRUCTURE_POWER_BANK, STRUCTURE_INVADER_CORE];
// Mass attack damage per RANGED_ATTACK_POWER at range 0..3 (engine
// rangedMassAttack: 10, 4, 1 a part).
const kMassFactor = [1, 1, 0.4, 0.1];
const kEscapePlain = 1;
const kEscapeSwamp = 5;

const rewalker = defaultRewalker();

export interface Boost {
    part: BodyPartConstant
    boost: MineralBoostConstant
    // Ask for it in a lab beside a spawn (a MOVE boost: the hatchling is
    // slow until it is on).
    nearSpawn?: boolean
}

export function bodyCost(body: BodyPartConstant[]): number {
    return _.sum(body, part => BODYPART_COST[part]);
}

// The rampart hits over `pos` (a hostile one; ours and public ones do not
// shield an enemy), 0 for none.
export function coverHits(pos: RoomPosition): number {
    return _.sum(pos.lookFor(LOOK_STRUCTURES), s =>
        s.structureType === STRUCTURE_RAMPART && !(s as StructureRampart).my ? s.hits : 0);
}

// A tile a creep of ours could stand on: inside the room's edge, not a
// terrain wall, no obstacle structure (a hostile rampart blocks, ours and
// public ones do not), no creep on it but `self`. Needs vision.
export function standable(pos: RoomPosition, self?: Creep): boolean {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) return false;
    if (Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y) & TERRAIN_MASK_WALL) return false;
    for (const s of pos.lookFor(LOOK_STRUCTURES)) {
        if (s.structureType === STRUCTURE_RAMPART) {
            if (!(s as StructureRampart).my && !(s as StructureRampart).isPublic) return false;
        } else if (_.contains(OBSTACLE_OBJECT_TYPES, s.structureType)) return false;
    }
    return !_.any(pos.lookFor(LOOK_CREEPS), c => c.id !== self?.id);
}

// A spawn with a lab within kLabRange.
export function nearLab(spawn: StructureSpawn): boolean {
    return _.any(spawn.room.findStructs(STRUCTURE_LAB), l => spawn.pos.inRangeTo(l, kLabRange));
}

@register
export class Wicktwo extends JobCreep {
    static readonly body: BodyPartConstant[] = [
        ..._.times(kTough, () => TOUGH),
        ..._.times(kMoves, () => MOVE),
        ..._.times(kRanged, () => RANGED_ATTACK),
        ..._.times(kHeals, () => HEAL),
    ] as BodyPartConstant[];

    // The boosts a wick wants, the ranged one only when asked.
    static boosts(ranged: boolean): Boost[] {
        const list: Boost[] = [{ part: TOUGH, boost: kToughBoost }, { part: HEAL, boost: kHealBoost }];
        if (ranged) list.push({ part: RANGED_ATTACK, boost: kRangedBoost });
        return list;
    }

    // Parts of `part` in `body` with no boost on them.
    static bare(body: BodyPartConstant[] | BodyPartDefinition[], part: BodyPartConstant): number {
        return _.sum(body as any[], (p: any) => (p.type || p) === part && !p.boost ? 1 : 0);
    }

    // Spawn from a home spawn with a lab within kLabRange when there is one
    // (Wickthree: its MOVEs are boosted there).
    static readonly spawnNearLabs: boolean = false;

    get ctor(): typeof Wicktwo {
        return this.constructor as typeof Wicktwo;
    }

    // Ahead of the home room's routine eggs: the assault waits on it.
    priority = 3;

    // Own targets (attack mode with nothing listed), by id on the heap.
    creepId: Id<Creep> | null = null;
    structId: Id<Structure> | null = null;

    get assaultMission(): AssaultTwo {
        return this.mission as AssaultTwo;
    }

    get cc(): CreepMove {
        return this.c as CreepMove;
    }

    // The job's body: a subclass (Ballerina, Wickthree) overrides the static.
    get bodyPlan(): BodyPartConstant[] {
        return this.ctor.body;
    }

    // A home spawn with the body's cost on hand (readySpawn); with
    // spawnNearLabs one of the home's with a lab within kLabRange when any
    // has (the home's spawns are picked out first: readySpawn narrows to
    // home itself, and a near-lab spawn elsewhere would leave it nothing).
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const body = this.bodyPlan;
        let pool = spawns;
        if (this.ctor.spawnNearLabs) {
            const home = this.mission?.getRoomName("home");
            const own = home ? spawns.filter(s => s.room.name === home) : spawns;
            const near = own.filter(nearLab);
            if (near.length) pool = near;
        }
        return [this.readySpawn(pool, bodyCost(body)), body];
    }

    // Where to step out of `spawn` (read by the spawn daemon): beside the
    // lab within kLabRange that holds or is claimed for our first wanted
    // boost, else the nearest such lab; undefined (any tile) when no lab is
    // that close or no tile beside the spawn touches it.
    spawnDirections(spawn: StructureSpawn): DirectionConstant[] | undefined {
        if (!this.ctor.spawnNearLabs) return undefined;
        const labs = (spawn.room.findStructs(STRUCTURE_LAB) as StructureLab[]).filter(l => spawn.pos.inRangeTo(l, kLabRange));
        if (!labs.length) return undefined;
        const first = _.first(this.wantedBoosts());
        const lab = (first && _.find(labs, l => l.boost === first.boost || l.mineralType === first.boost))
            || spawn.pos.findClosestByRange(labs) || labs[0];
        const dirs = kDirections.filter(d => {
            const pos = positionAtDirection(spawn.pos, d);
            return pos.roomName === spawn.pos.roomName && pos.isNearTo(lab) && standable(pos);
        });
        return dirs.length ? dirs : undefined;
    }

    wantedBoosts(): Boost[] {
        return this.ctor.boosts(!!this.assaultMission?.boostRanged);
    }

    // The wanted boosts with a bare part still on the body.
    missingBoosts(): Boost[] {
        return this.wantedBoosts().filter(b => Wicktwo.bare(this.c.body, b.part) > 0);
    }

    get boosted(): boolean {
        return !this.missingBoosts().length;
    }

    start(): Task2Ret {
        const m = this.assaultMission;
        if (!m) return "wait";
        if (this.escape()) return "wait";
        // Recycling comes before boosting: a wick that hatches into a paused
        // mission hands its body back unboosted.
        if (m.recycling) return this.recycleAt(this.originSpawn());
        if (!this.boosted && this.pos.roomName === this.homeName) return this.boost();
        if (!m.manual && m.mode === "attack") return this.fight();
        return this.stage();
    }

    // At home with boosts missing: ask the labs for each (every tick: a
    // lab's boost claim lasts 15 ticks) and take one from a lab that holds
    // enough mineral and energy for the bare parts, waiting beside the
    // first lab asked otherwise.
    boost(): Task2Ret {
        const c = this.c;
        let missing = this.missingBoosts();
        // A MOVE boost at the head of the list goes on first: until it is
        // the hatchling crawls, so it waits at that lab and asks for nothing
        // else (Wickthree).
        if (missing[0]?.part === MOVE) missing = [missing[0]];
        const asked = missing.map(b => ({ b, lab: c.room.requestBoost(b.boost, !!b.nearSpawn) as StructureLab | null }));
        const ready = _.find(asked, ({ b, lab }) => {
            if (!lab || lab.mineralType !== b.boost) return false;
            const n = Wicktwo.bare(c.body, b.part);
            return lab.mineralAmount >= n * LAB_BOOST_MINERAL && lab.store.energy >= n * LAB_BOOST_ENERGY;
        });
        const lab = ready?.lab || _.first(_.compact(asked.map(a => a.lab)));
        if (!lab) return "wait";
        if (!this.pos.isNearTo(lab)) {
            this.moveTarget(lab, 1);
            return "wait";
        }
        if (ready) {
            const err = lab.boostCreep(c);
            if (err !== OK) this.log("boost", ready.b.boost, "at", lab, "failed", err);
            else this.log("boosted", ready.b.boost, "at", lab);
        }
        return "wait";
    }

    // In a foreign room in safe mode with a hostile tower: step toward the
    // nearest exit over the Rewalker's matrix (a direct move, the stored
    // walk resumes once out). False when there is nothing to escape, or
    // the wick already stands on an exit tile (the room logic walks it out).
    escape(): boolean {
        const c = this.c;
        const room = c.room;
        const ctrl = room.controller;
        if (!ctrl || ctrl.my || !ctrl.safeMode) return false;
        if (!this.towerStands(room)) return false;
        const exits = room.find(FIND_EXIT);
        if (!exits.length) return false;
        const ret = PathFinder.search(c.pos, exits.map(pos => ({ pos, range: 0 })), {
            maxRooms: 1,
            plainCost: kEscapePlain,
            swampCost: kEscapeSwamp,
            roomCallback: name => name === room.name ? rewalker.getMatrix(name) : false,
        });
        const next = ret.path[0];
        if (!next) return false;
        this.dlog("escaping", room.name, "safe mode", ctrl.safeMode, "via", _.last(ret.path));
        c.move(c.pos.getDirectionTo(next));
        return true;
    }

    // A hostile tower stands in `room`, with energy or not.
    towerStands(room: Room): boolean {
        return _.any(room.find(FIND_HOSTILE_STRUCTURES), s => s.structureType === STRUCTURE_TOWER);
    }

    // Enemy creeps of `room` built to fight, Source Keepers left out.
    militants(room: Room): Creep[] {
        return militantsIn(room);
    }

    // The militants worth a shot: not under a rampart over kRampartSkip.
    shootable(room: Room): Creep[] {
        return this.militants(room).filter(e => coverHits(e.pos) <= kRampartSkip);
    }

    // Active militants before inactive, the nearest of the pool; null for none.
    pickCreep(creeps: Creep[]): Creep | null {
        if (!creeps.length) return null;
        const active = creeps.filter(isActiveMilitant);
        const pool = active.length ? active : creeps;
        return this.pos.findClosestByRange(pool) || pool[0];
    }

    // Structures a wick may shoot in `room`: not ours, with hits, none of
    // kIgnored; containers only once nothing else is left.
    structures(room: Room): Structure[] {
        const all = room.find(FIND_STRUCTURES).filter(s =>
            !(s as OwnedStructure).my && s.hits > 0 && !_.contains(kIgnored, s.structureType));
        const main = all.filter(s => s.structureType !== STRUCTURE_CONTAINER);
        return main.length ? main : all;
    }

    // Stage: wait by the staging flag (the staging room without one), and
    // engage a militant creep while one is in the staging room.
    stage(): Task2Ret {
        const m = this.assaultMission;
        const staging = m.getRoomName("staging");
        if (staging && this.pos.roomName === staging) {
            const foe = this.pickCreep(this.militants(this.c.room));
            if (foe) return this.engage(foe);
        }
        const flag = m.stagingFlag;
        if (flag) {
            if (!this.pos.inRangeTo(flag.pos, kStagedRange)) this.movePos(flag.pos, kStagedRange);
            return "wait";
        }
        if (staging && this.pos.roomName !== staging) return this.moveRoom(staging);
        return "wait";
    }

    // Attack: in the target room, the walk goes to the listed target, else
    // one of our own; nothing left, hold by the mission flag.
    fight(): Task2Ret {
        const m = this.assaultMission;
        if (this.pos.roomName !== m.roomName) return this.moveRoom(m.roomName);
        const c = this.cc;
        const room = c.room;
        const listed = m.targets();
        if (listed.length) this.creepId = this.structId = null;
        if (this.fleeMelee(room)) return "wait";
        const goal = listed[0] || this.ownTarget(room);
        if (!goal) return this.hold();
        if (goal instanceof Creep) return this.engage(goal);
        if (!this.pos.isNearTo(goal)) this.moveTarget(goal, 1);
        else this.reposition(goal);
        return "wait";
    }

    // Beside `goal` (file header): to the tile within 1 of it and one step
    // from us, among those we could stand on, where a mass attack deals the
    // most, when that is as much as from here or more. One step at a time:
    // a tile beside the target but two steps away may be the far side of
    // the wall we are shooting (wickthree0 wanted 41,17 across the W28N1
    // plug from 43,16 and failed the walk every tick, 1 Nov 2026), and a
    // tile a step away is reached by a plain move, no path search. The
    // wick still circles the target over several ticks when each step
    // pays. False when we stay.
    reposition(goal: Structure): boolean {
        const here = this.massDamage(this.pos);
        const tiles: RoomPosition[] = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = goal.pos.x + dx;
                const y = goal.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const pos = new RoomPosition(x, y, goal.pos.roomName);
                if (pos.isEqualTo(this.pos) || !pos.isNearTo(this.pos) || !standable(pos, this.c)) continue;
                tiles.push(pos);
            }
        }
        if (!tiles.length) return false;
        const scored = tiles.map(pos => ({ pos, dmg: this.massDamage(pos) }));
        const best = _.max(scored, s => s.dmg);
        if (best.dmg < here) return false;
        this.dlog("reposition", this.pos, here, "->", best.pos, best.dmg);
        this.cc.move(this.pos.getDirectionTo(best.pos));
        return true;
    }

    // Step away from the working melee enemies when one is within kDanger.
    fleeMelee(room: Room): boolean {
        const melees = this.militants(room).filter(e => e.melee);
        if (!_.any(melees, e => this.pos.inRangeTo(e, kDanger))) return false;
        this.cc.idleFlee(melees, kFleeTo);
        return true;
    }

    // Close on a creep: to kFleeTo from a melee (fled when nearer), to
    // kEngageRange from anything else.
    engage(target: Creep): Task2Ret {
        if (this.fleeMelee(target.room)) return "wait";
        const hold = target.melee ? kFleeTo : kEngageRange;
        if (this.pos.getRangeTo(target) > hold) this.moveTarget(target, hold);
        return "wait";
    }

    // With nothing listed: the kept creep target while it is still in the
    // room, else the militant with the least hits (rampart included); then
    // the kept structure, else the one with the least hits.
    ownTarget(room: Room): Creep | Structure | null {
        const kept = this.creepId && Game.getObjectById(this.creepId);
        if (kept && kept.room.name === room.name) return kept;
        this.creepId = null;
        const mil = this.militants(room);
        if (mil.length) {
            const pick = _.min(mil, e => e.hits + coverHits(e.pos));
            this.creepId = pick.id;
            this.structId = null;
            this.dlog("own target", pick, pick.hits, "+", coverHits(pick.pos));
            return pick;
        }
        const keptStruct = this.structId && Game.getObjectById(this.structId);
        if (keptStruct && keptStruct.hits > 0) return keptStruct;
        this.structId = null;
        const structs = this.structures(room);
        if (!structs.length) return null;
        const pick = _.min(structs, s => s.hits);
        this.structId = pick.id;
        this.dlog("own target", pick, pick.hits);
        return pick;
    }

    // Nothing left: within kHoldRange of the mission flag, where it is.
    hold(): Task2Ret {
        const flag = this.assaultMission.flag;
        if (flag && flag.pos.roomName === this.pos.roomName && !this.pos.inRangeTo(flag.pos, kHoldRange)) {
            this.movePos(flag.pos, kHoldRange);
        }
        return "wait";
    }

    // A ranged shot's damage: working RANGED_ATTACK parts, boosts counted.
    shotDamage(): number {
        return _.sum(this.c.body, p => {
            if (p.type !== RANGED_ATTACK || !p.hits) return 0;
            const mult = p.boost ? (BOOSTS[RANGED_ATTACK] as any)[p.boost].rangedAttack : 1;
            return RANGED_ATTACK_POWER * mult;
        });
    }

    // What a mass attack from `pos` (ours by default) would deal: every
    // hostile creep and owned hostile structure with hits within 3, by range
    // (kMassFactor). A creep under a hostile rampart is left out: the
    // damage lands on the rampart, counted among the structures.
    massDamage(pos: RoomPosition = this.pos): number {
        const room = this.c.room;
        const shot = this.shotDamage();
        const hit = (o: RoomObject & { hits?: number }) => {
            const r = pos.getRangeTo(o);
            return r <= kShotRange && (o.hits || 0) > 0 ? shot * kMassFactor[r] : 0;
        };
        const creeps = room.find(FIND_HOSTILE_CREEPS).filter(c => !coverHits(c.pos));
        return _.sum(creeps, hit) + _.sum(room.find(FIND_HOSTILE_STRUCTURES), hit);
    }

    // The firing ladder (file header). `structs` allows the structure rungs.
    fire(listed: Structure[], structs: boolean): boolean {
        const c = this.cc;
        if (!c.intents.canRange()) return false;
        const room = c.room;
        const inRange = (o: RoomObject) => this.pos.inRangeTo(o, kShotRange);
        // Spawns are spared while a tower stands (file header).
        const spare = structs && this.towerStands(room);
        const spared = (s: Structure) => spare && s.structureType === STRUCTURE_SPAWN;
        const focus: Creep | Structure | null = _.find(listed, s => inRange(s) && !spared(s))
            || this.pickCreep(this.shootable(room).filter(inRange));
        const massOk = structs && !(spare && _.any(room.find(FIND_HOSTILE_SPAWNS), inRange));
        const mass = massOk ? this.massDamage() : 0;
        if (focus) {
            if (massOk && this.pos.isNearTo(focus) && mass >= this.shotDamage()) return this.massAttack();
            return this.shoot(focus);
        }
        if (!structs) return false;
        const weakest = _.min(this.structures(room).filter(s => inRange(s) && !spared(s)), s => s.hits) as Structure | number;
        const single = weakest instanceof Structure ? this.shotDamage() : 0;
        if (mass > single) return this.massAttack();
        if (weakest instanceof Structure) return this.shoot(weakest);
        return false;
    }

    shoot(target: Creep | Structure): boolean {
        const c = this.cc;
        if (c.rangedAttack(target) !== OK) return false;
        c.intents.setRange(target);
        return true;
    }

    massAttack(): boolean {
        const c = this.cc;
        if (c.rangedMassAttack() !== OK) return false;
        c.intents.setRange("mass attack");
        return true;
    }

    // A tower in the room with the energy for a shot.
    towerThreat(room: Room): boolean {
        return _.any(room.find(FIND_HOSTILE_STRUCTURES), s =>
            s.structureType === STRUCTURE_TOWER && (s as StructureTower).store.energy >= TOWER_ENERGY_COST);
    }

    after() {
        const c = this.cc;
        if (!c) return;
        const m = this.assaultMission;
        const inTarget = !!m && this.pos.roomName === m.roomName;
        this.fire(inTarget ? m.targets() : [], inTarget);
        if (!c.hurts && this.towerThreat(c.room) && healSelf(c)) return;
        const near = _.any(c.room.enemies || c.room.find(FIND_HOSTILE_CREEPS), e => !e.keeper && this.pos.inRangeTo(e, kShotRange));
        healIdle(c, near);
    }
}
