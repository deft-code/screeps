// Power creeps: a complete rebuild (Sept 2026) on the TCreep wrapper design.
//
// The 2019 prototype-extension roles (HarleyQuinn, Heimdall, Genesis,
// Magellan; Tasker-driven task*/idle* methods for operating extensions,
// sources, observers, renewing, enabling rooms, ping-pong between flags) were
// removed here. For reference see docs/legacy-systems.md and git history before
// this rewrite (`git log -- src/powercreep.ts`). Worth remembering from them:
//   - a power creep must be renewed at a power spawn or power bank before
//     ticksToLive runs out (they had taskHomeRenew at ~200 TTL);
//   - powers only work in rooms whose controller has power enabled
//     (enableRoom, once per room, needs the creep adjacent);
//   - PWR_GENERATE_OPS was run whenever idle and off cooldown;
//   - foreign controllers were left alone when signed/owned by listed players.
// Behaviour now belongs to services such as ms.furiosa.ts, built on the
// wrappers below.
import * as debug from "debug";
import { defaultRewalker } from "Rewalker";
import { anything, swipeWorth, worthless, Worth } from "swipeworth";

const rewalker = defaultRewalker();

// Ticks a structure that refused a withdraw (hostile rampart on top) is skipped.
const kSwipeSkipTicks = 1500;
// Withdrawing from a nuker is bugged; everything else with a store is fair game.
const kNoSwipe: StructureConstant[] = [STRUCTURE_NUKER];

interface SwipeMemory {
    // structure being emptied; re-picked when gone, empty or skipped
    target?: Id<AnyStoreStructure>
    // structure id -> tick until which it is left alone
    skip?: { [id: string]: number }
    // the target room had nothing left when we set off home with a partial load
    dry?: boolean
}

declare global {
    interface PowerCreepMemory {
        debug?: number
        // room of the power spawn this creep was last spawned at (MyPowerCreep.spawn)
        home?: string
        swipe?: SwipeMemory
    }
}

// Resources a store holds that are `worth` taking, in random order (same
// helper as job.swiper.ts).
function stocked(store: StoreDefinition | Store<ResourceConstant, false>, worth: Worth = anything): ResourceConstant[] {
    const st = store as unknown as { [res: string]: number };
    return _.shuffle(Object.keys(st).filter(res => st[res] > 0 && worth(res as ResourceConstant))) as ResourceConstant[];
}

// ---------------------------------------------------------------------------
// TPowerCreep / MyPowerCreep: persistent wrappers in the TCreep style
// (docs/tcreep-design.md). Keyed by power creep name; the game object is
// re-resolved every tick through `obj`, and nothing but the name and packed
// positions is kept across ticks.
//
//   TPowerCreep    any power creep, mine or foreign: inspection only, no intents
//   MyPowerCreep   one of mine: every intent the PowerCreep API offers
//
// getPowerCreep(name) hands out the right class from a module registry.
// ---------------------------------------------------------------------------

type GPowerCreep = PowerCreep;

// Hostile power creeps in view this tick, by name. Built at most once per tick.
let foreignTick = -1;
let foreign = new Map<string, GPowerCreep>();
function foreignPowerCreeps(): Map<string, GPowerCreep> {
    if (foreignTick === Game.time) return foreign;
    foreignTick = Game.time;
    foreign = new Map();
    for (const room of _.values(Game.rooms) as Room[]) {
        for (const pc of room.find(FIND_HOSTILE_POWER_CREEPS)) {
            foreign.set(pc.name, pc);
        }
    }
    return foreign;
}

export class TPowerCreep extends debug.Debuggable {
    private _tick = -1;
    private _obj: GPowerCreep | undefined;
    lastSeen = 0;
    lastRoom?: string;
    lastXY?: number;

    constructor(readonly name: string) {
        super();
    }

    // Game.powerCreeps holds every one of mine, spawned or not; anyone else's
    // is only known while it stands in a room we see.
    protected lookup(): GPowerCreep | undefined {
        return Game.powerCreeps[this.name] || foreignPowerCreeps().get(this.name);
    }

    // The game object for this tick, or undefined; the only place it is fetched.
    get obj(): GPowerCreep | undefined {
        if (this._tick !== Game.time) {
            this._tick = Game.time;
            this._obj = this.lookup();
            if (this._obj) {
                this.lastSeen = Game.time;
                if (this._obj.pos) {
                    this.lastRoom = this._obj.pos.roomName;
                    this.lastXY = this._obj.pos.x * 100 + this._obj.pos.y;
                }
            }
        }
        return this._obj;
    }

    // The actual PowerCreep; throws when it cannot be resolved this tick.
    get p(): GPowerCreep {
        const o = this.obj;
        if (!o) throw new Error(`${this.name}: no PowerCreep object this tick`);
        return o;
    }

    // Debuggable wants a memory; only my power creeps have one.
    get memory(): PowerCreepMemory {
        return Memory.powerCreeps[this.name] = Memory.powerCreeps[this.name] || {};
    }

    // MyPowerCreep for one of mine (this instance when it already is one), else null.
    mine(): MyPowerCreep | null {
        if (this instanceof MyPowerCreep) return this;
        if (!Game.powerCreeps[this.name]) return null;
        return getPowerCreep(this.name) as MyPowerCreep;
    }

    // --- state ---------------------------------------------------------------

    get exists(): boolean { return this.obj !== undefined; }
    get my(): boolean { return !!Game.powerCreeps[this.name]; }
    // Standing in a room somewhere (an unspawned one of mine has no room).
    get spawned(): boolean { return !!this.obj?.room; }
    get onThisShard(): boolean {
        const o = this.obj;
        return !!o && (!o.shard || o.shard === Game.shard.name);
    }
    get pos(): RoomPosition | undefined { return this.obj?.pos; }
    get room(): Room | undefined { return this.obj?.room; }
    get id(): Id<GPowerCreep> | undefined { return this.obj?.id; }
    get owner(): string | undefined { return this.obj?.owner?.username; }
    get className(): PowerClassConstant | undefined { return this.obj?.className; }
    get level(): number { return this.obj?.level || 0; }
    get hits(): number { return this.obj?.hits || 0; }
    get hitsMax(): number { return this.obj?.hitsMax || 0; }
    get hurts(): number { return this.hitsMax - this.hits; }
    get ticksToLive(): number { return this.obj?.ticksToLive || 0; }
    get store(): StoreDefinition | undefined { return this.obj?.store; }
    get saying(): string | undefined { return this.obj?.saying; }
    get powers(): PowerCreepPowers { return this.obj?.powers || {}; }
    get deleteTime(): number | undefined { return this.obj?.deleteTime; }
    // Wall-clock ms until spawn is allowed again; 0 when it may spawn now.
    get spawnCooldown(): number {
        const at = this.obj?.spawnCooldownTime;
        return at ? Math.max(0, at - Date.now()) : 0;
    }

    hasPower(power: PowerConstant): boolean {
        return this.powers[power] !== undefined;
    }
    powerLevel(power: PowerConstant): number {
        return this.powers[power]?.level || 0;
    }
    powerCooldown(power: PowerConstant): number {
        return this.powers[power]?.cooldown || 0;
    }
    // Usable now: known, off cooldown, and (when the power needs it) enough ops.
    powerReady(power: PowerConstant): boolean {
        if (!this.hasPower(power) || this.powerCooldown(power) > 0) return false;
        const info = POWER_INFO[power] as { ops?: number | number[] };
        const ops = _.isArray(info.ops) ? info.ops[this.powerLevel(power) - 1] : info.ops;
        return !ops || (this.store?.[RESOURCE_OPS] || 0) >= ops;
    }
    // Room the creep was last spawned in; where it renews. Set by MyPowerCreep.spawn.
    get homeName(): string | undefined { return this.memory.home; }
    get home(): Room | undefined { return this.homeName ? Game.rooms[this.homeName] : undefined; }

    // The room's controller has power enabled for us (needed to use powers there).
    get roomPowerEnabled(): boolean {
        return !!this.room?.controller?.isPowerEnabled;
    }

    toString() {
        const pos = this.pos;
        if (pos) return `<a href="/a/#!/room/${Game.shard.name}/${pos.roomName}">${this.name}</a>`;
        return `[PowerCreep ${this.name}${this.exists ? "" : " (missing)"}]`;
    }
}

// Every intent the PowerCreep API offers, on top of TPowerCreep's inspection.
// `intents` records what was issued this tick (CLAUDE.md convention) so a
// second action of the same kind can be avoided.
export class MyPowerCreep extends TPowerCreep {
    private _intentsTick = -1;
    private _intents: { [kind: string]: any } = {};

    get intents(): { [kind: string]: any } {
        if (this._intentsTick !== Game.time) {
            this._intentsTick = Game.time;
            this._intents = {};
        }
        return this._intents;
    }

    private issue<K extends string>(kind: K, err: ScreepsReturnCode, what: any = true): ScreepsReturnCode {
        if (err === OK) this.intents[kind] = what;
        else this.dlog(kind, "failed", err);
        return err;
    }

    // --- lifecycle -----------------------------------------------------------

    // Spawn at a power spawn and remember its room as home.
    spawn(ps: StructurePowerSpawn): ScreepsReturnCode {
        const err = this.issue("spawn", this.p.spawn(ps), ps);
        if (err === OK) this.memory.home = ps.room.name;
        return err;
    }
    renew(target: StructurePowerSpawn | StructurePowerBank): ScreepsReturnCode {
        return this.issue("renew", this.p.renew(target), target);
    }
    upgrade(power: PowerConstant): ScreepsReturnCode {
        return this.issue("upgrade", this.p.upgrade(power), power);
    }
    rename(name: string): ScreepsReturnCode {
        return this.p.rename(name);
    }
    // Schedule (or with cancel=true undo) the account-level deletion.
    delete(cancel = false): ScreepsReturnCode {
        return this.p.delete(cancel);
    }
    suicide(): ScreepsReturnCode {
        return this.issue("suicide", this.p.suicide());
    }
    notifyWhenAttacked(enabled: boolean): ScreepsReturnCode {
        return this.p.notifyWhenAttacked(enabled);
    }
    cancelOrder(method: string): ScreepsReturnCode {
        return this.p.cancelOrder(method);
    }

    // --- powers ----------------------------------------------------------------

    usePower(power: PowerConstant, target?: RoomObject): ScreepsReturnCode {
        return this.issue("usePower", this.p.usePower(power, target), power);
    }
    enableRoom(controller: StructureController): ScreepsReturnCode {
        return this.issue("enableRoom", this.p.enableRoom(controller), controller);
    }

    // --- movement --------------------------------------------------------------

    move(direction: DirectionConstant): ScreepsReturnCode {
        return this.issue("move", this.p.move(direction), direction);
    }
    moveTo(target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): ScreepsReturnCode {
        return this.issue("move", this.p.moveTo(target, opts), target);
    }
    moveByPath(path: PathStep[] | RoomPosition[] | string): ScreepsReturnCode {
        return this.issue("move", this.p.moveByPath(path), path);
    }

    // --- resources -------------------------------------------------------------

    withdraw(target: Structure | Tombstone | Ruin, resource: ResourceConstant, amount?: number): ScreepsReturnCode {
        return this.issue("withdraw", this.p.withdraw(target, resource, amount), target);
    }
    transfer(target: AnyCreep | Structure, resource: ResourceConstant, amount?: number): ScreepsReturnCode {
        return this.issue("transfer", this.p.transfer(target, resource, amount), target);
    }
    pickup(resource: Resource): ScreepsReturnCode {
        return this.issue("pickup", this.p.pickup(resource), resource);
    }
    drop(resource: ResourceConstant, amount?: number): ScreepsReturnCode {
        return this.issue("drop", this.p.drop(resource, amount), resource);
    }

    say(message: string, toPublic = false): ScreepsReturnCode {
        return this.p.say(message, toPublic);
    }

    // --- movement helpers (Rewalker) ---------------------------------------------

    // Walk toward pos; OK once within range, a direction while moving, else an error.
    walkTo(pos: RoomPosition, range = 1): ScreepsReturnCode | DirectionConstant {
        const ret = rewalker.walkTo(this.p, pos, range);
        if (ret > 0) this.intents.move = pos;
        return ret;
    }

    // Toward the middle of a room until inside its 20-range core.
    moveRoom(roomName: string, range = 20): ScreepsReturnCode | DirectionConstant {
        return this.walkTo(new RoomPosition(25, 25, roomName), range);
    }

    // --- renew ------------------------------------------------------------------

    // Renew at a power spawn we happen to stand next to; no movement. Power
    // creeps live 5000 ticks per renew and die for good when TTL runs out.
    idleRenew(): boolean {
        if (this.intents.renew) return true;
        const p = this.p;
        if (!p.room) return false;
        const ps = _.find(p.room.findStructs(STRUCTURE_POWER_SPAWN) as StructurePowerSpawn[], s => s.my && p.pos.isNearTo(s));
        if (!ps) return false;
        return this.renew(ps) === OK;
    }

    // Walk to the power spawn in `roomName` (default: the room we spawned in)
    // and renew there. Returns a status string.
    runRenew(roomName = this.homeName): string {
        if (!roomName) return "renew: no home room";
        const p = this.p;
        if (p.pos.roomName !== roomName) {
            this.moveRoom(roomName);
            return `renew: to ${roomName}`;
        }
        const ps = _.find(p.room!.findStructs(STRUCTURE_POWER_SPAWN) as StructurePowerSpawn[], s => s.my);
        if (!ps) return `renew: no power spawn in ${roomName}`;
        if (!p.pos.isNearTo(ps)) {
            this.walkTo(ps.pos, 1);
            return "renew: to power spawn";
        }
        const err = this.renew(ps);
        return err === OK ? "renewed" : `renew failed ${err}`;
    }

    // --- swipe: loot a room's structures and haul home (job.swiper.ts, for a power creep) ---
    //
    // Fill up from the cheapest-path non-own structure with anything in its
    // store (nukers and rampart-covered tiles excepted), then walk straight to
    // the home storage (terminal, else drop at the controller) and unload one
    // resource per tick. A room run dry sends the partial load home and is
    // remembered as dry. Returns a short status string for the caller's logs,
    // or false once the creep is empty and the target room has nothing left,
    // whether it stands there or has just unloaded at home. Only what is worth
    // the trip is taken or counts as "left" (swipeworth.ts, priced for
    // homeRoom); unloading takes everything aboard.
    swipeWorth: Worth = anything;

    runSwipe(targetRoom: string, homeRoom: string): string | false {
        const ret = this.swipeStep(targetRoom, homeRoom);
        this.idleNom();
        return ret;
    }

    // Grab what lies within reach (a pile, then a tombstone, then a ruin)
    // with whatever intents the tick has left, except the worthless: a
    // Konmari drops that along the swipe roads. No movement.
    idleNom(): boolean {
        const p = this.p;
        if (!p.room || !p.store.getFreeCapacity()) return false;
        if (!this.intents.pickup) {
            const pile = _.find(p.room.lookForAtRange(LOOK_RESOURCES, p.pos, 1, true),
                spot => !worthless(spot[LOOK_RESOURCES].resourceType));
            if (pile) return this.pickup(pile[LOOK_RESOURCES]) === OK;
        }
        if (this.intents.withdraw || this.intents.transfer) return false;
        for (const look of [LOOK_TOMBSTONES, LOOK_RUINS] as (LOOK_TOMBSTONES | LOOK_RUINS)[]) {
            for (const spot of p.room.lookForAtRange(look, p.pos, 1, true)) {
                const holder = (spot as any)[look] as Tombstone | Ruin;
                const res = _.first(stocked(holder.store, r => !worthless(r)));
                if (res) return this.withdraw(holder, res) === OK;
            }
        }
        return false;
    }

    swipeStep(targetRoom: string, homeRoom: string): string | false {
        const p = this.p;
        this.swipeWorth = swipeWorth(homeRoom);
        this.idleRenew();
        const mem = this.memory.swipe = this.memory.swipe || {};
        const holding = p.store.getUsedCapacity() > 0;
        if (!p.store.getFreeCapacity()) return this.swipeDeliver(homeRoom);

        if (p.pos.roomName !== targetRoom) {
            if (mem.dry) {
                if (holding) return this.swipeDeliver(homeRoom);
                delete this.memory.swipe;
                return false;
            }
            delete mem.target;
            this.moveRoom(targetRoom);
            return "to target";
        }

        let target = mem.target ? Game.getObjectById(mem.target) : null;
        if (!target || !stocked(target.store, this.swipeWorth).length || (mem.skip?.[target.id] || 0) > Game.time) {
            target = this.pickSwipeTarget(mem);
            mem.target = target?.id;
        }
        if (target) {
            delete mem.dry;
            return this.swipeFrom(target, mem);
        }
        if (holding) {
            mem.dry = true;
            return this.swipeDeliver(homeRoom);
        }
        delete this.memory.swipe;
        return false;
    }

    // Structures that are not ours, hold anything, have no rampart on top and
    // have not refused us recently; the one with the cheapest path wins
    // (Rewalker.planWalk stores that path, so walkTo follows it).
    pickSwipeTarget(mem: SwipeMemory): AnyStoreStructure | null {
        const p = this.p;
        if (!p.room) return null;
        const skip = mem.skip || {};
        const targets = p.room.find(FIND_STRUCTURES, {
            filter: (st: AnyStructure) => !(st as OwnedStructure).my &&
                !_.contains(kNoSwipe, st.structureType) &&
                (st as AnyStoreStructure).store !== undefined &&
                stocked((st as AnyStoreStructure).store, this.swipeWorth).length > 0 &&
                !(skip[st.id] > Game.time) &&
                !_.any(st.pos.lookFor(LOOK_STRUCTURES), r => r.structureType === STRUCTURE_RAMPART),
        }) as AnyStoreStructure[];
        if (!targets.length) return null;
        const i = rewalker.planWalk(p, targets.map(t => ({ pos: t.pos, range: 1 })));
        if (i >= 0) return targets[i];
        this.dlog("planWalk failed", i, "falling back to range");
        return p.pos.findClosestByRange(targets);
    }

    swipeFrom(target: AnyStoreStructure, mem: SwipeMemory): string {
        const p = this.p;
        if (!p.pos.isNearTo(target)) {
            this.walkTo(target.pos, 1);
            return `to ${target.structureType}`;
        }
        const res = _.first(stocked(target.store, this.swipeWorth))!;
        const err = this.withdraw(target, res);
        if (err === OK) return `swiping ${res}`;
        if (err === ERR_NOT_OWNER) {
            const skip = mem.skip = mem.skip || {};
            skip[target.id] = Game.time + kSwipeSkipTicks;
            this.log(target.structureType, "at", target.pos, "is covered, skipping");
        } else {
            this.log("withdraw from", target.structureType, "at", target.pos, "failed", err);
        }
        delete mem.target;
        return "retarget";
    }

    // Straight to the home store from wherever we are (one cross-room walk).
    swipeDeliver(homeRoom: string): string {
        const p = this.p;
        const home = Game.rooms[homeRoom];
        if (!home) {
            this.moveRoom(homeRoom);
            return "to home";
        }
        const res = _.first(stocked(p.store));
        if (!res) return "empty";
        const store = home.storage || home.terminal;
        if (store) {
            if (!p.pos.isNearTo(store)) {
                this.walkTo(store.pos, 1);
                return "to store";
            }
            this.transfer(store, res);
            return `unloading ${res}`;
        }
        if (home.controller) {
            if (this.walkTo(home.controller.pos, 3) !== OK) return "to controller";
            this.drop(res);
            return `dropping ${res}`;
        }
        this.log("nowhere to deliver in", homeRoom);
        return "stuck: no store";
    }
}

// Registry: one wrapper per name for the life of the global. Mine are always
// MyPowerCreep; anyone else's a plain TPowerCreep.
const powerCreeps = new Map<string, TPowerCreep>();
export function getPowerCreep(name: string): TPowerCreep {
    let t = powerCreeps.get(name);
    const mine = !!Game.powerCreeps[name];
    if (!t || (mine && !(t instanceof MyPowerCreep))) {
        t = mine ? new MyPowerCreep(name) : new TPowerCreep(name);
        powerCreeps.set(name, t);
    }
    return t;
}

// All of my power creeps, spawned or not.
export function myPowerCreeps(): MyPowerCreep[] {
    return _.keys(Game.powerCreeps).map(n => getPowerCreep(n) as MyPowerCreep);
}
