// Power creeps on the TAnyCreep wrapper (tanycreep.ts, docs/tcreep-design.md).
//
//   TPowerCreep        any power creep: powers, level, class; inspection only
//   EnemyPowerCreep    someone else's, id-keyed, kept by the enemy registry (enemy.ts)
//   MyPowerCreep       one of mine, keyed by name, there whether or not it is
//                      spawned: every PowerCreep intent with intent tracking,
//                      one wrapper per power, home and birth rooms, Rewalker
//                      walks, renewing, and the swipe quest (swipe.ts)
//
// getPowerCreep(name) hands out the MyPowerCreep for a name (one per global;
// `exists` says whether the account has it), myPowerCreeps() lists mine.
//
// The 2019 prototype-extension roles (HarleyQuinn, Heimdall, Genesis,
// Magellan) were removed in Sept 2026; docs/legacy-systems.md and git history
// before that rewrite have them. Worth remembering from them: a power creep
// must be renewed at a power spawn or power bank before ticksToLive runs
// out; powers only work in rooms whose controller has power enabled
// (enableRoom, once per room, adjacent); PWR_GENERATE_OPS ran whenever idle
// and off cooldown. Behaviour belongs to services such as ms.furiosa.ts.
import type { DebugMemory } from "debug";
import { WalkReturnCode } from "Rewalker";
import { CreepKind, TAnyCreep } from "tanycreep";
import { IntentLog, issue, MyBaseCreep, walkRoom, walkTo } from "mybasecreep";
import { Intents } from "intents";
import * as swipe from "swipe";
import { swipeWorth } from "swipeworth";

declare global {
    interface PowerCreepMemory {
        debug?: number
        // Room of the power spawn this creep was last spawned at (MyPowerCreep.spawn).
        birth?: string
        // Room the creep works for; set by a service, else the birth room.
        // Before Nov 2026 spawn() wrote the birth room here.
        home?: string
    }
}

export abstract class TPowerCreep extends TAnyCreep<PowerCreep> {
    readonly kind: CreepKind = "powerCreep";

    get className(): PowerClassConstant | undefined {
        return this.c?.className;
    }

    get level(): number {
        return this.c?.level ?? 0;
    }

    get powers(): PowerCreepPowers {
        return this.c?.powers ?? {};
    }

    // Standing in a room somewhere (an unspawned one of mine has no room).
    get spawned(): boolean {
        return !!this.c?.room;
    }

    get onThisShard(): boolean {
        const c = this.c;
        return !!c && (!c.shard || c.shard === Game.shard.name);
    }

    get deleteTime(): number | undefined {
        return this.c?.deleteTime;
    }

    // Wall-clock ms until spawn is allowed again; 0 when it may spawn now.
    get spawnCooldown(): number {
        const at = this.c?.spawnCooldownTime;
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

    // The room's controller has power enabled for us (needed to use powers there).
    get roomPowerEnabled(): boolean {
        return !!this.room?.controller?.isPowerEnabled;
    }
}

// Someone else's power creep: as EnemyCreep (tcreep.ts).
export class EnemyPowerCreep extends TPowerCreep {
    private readonly _id: Id<PowerCreep>;
    private _pos: RoomPosition;
    private readonly _mem: DebugMemory = {};

    constructor(c: PowerCreep) {
        super(c.name);
        this._id = c.id;
        this._pos = new RoomPosition(c.pos.x, c.pos.y, c.pos.roomName);
    }

    protected lookup(): PowerCreep | null {
        const c = Game.getObjectById(this._id);
        if (!c || c.my) return null;
        this._pos = c.pos;
        return c;
    }

    get id(): Id<PowerCreep> {
        return this._id;
    }

    get my(): boolean {
        return false;
    }

    get pos(): RoomPosition {
        return this.c?.pos ?? this._pos;
    }

    get roomName(): string {
        return this.pos.roomName;
    }

    get xy(): number {
        const pos = this.pos;
        return pos.x * 100 + pos.y;
    }

    get memory(): DebugMemory {
        return this._mem;
    }

    delete(): void { }

    toString(): string {
        const c = this.c;
        if (c) return `<a href="/a/#!/room/${Game.shard.name}/${c.pos.roomName}">${this.owner}:${this.name}</a>`;
        return `[enemy power creep ${this.name} last ${this.roomName} ${Game.time - this.lastSeen} ago]`;
    }
}

// One of mine. Game.powerCreeps holds every one of the account's, spawned or
// not, so `c` resolves even while the creep is off the map (`spawned` false,
// `pos` null) and `exists` is false only for a name the account does not have.
export class MyPowerCreep extends TPowerCreep implements MyBaseCreep {
    private readonly _intents = new IntentLog();

    protected lookup(): PowerCreep | undefined {
        return Game.powerCreeps[this.name];
    }

    get my(): boolean {
        return true;
    }

    get memory(): PowerCreepMemory {
        return Memory.powerCreeps[this.name] = Memory.powerCreeps[this.name] || {};
    }

    get intents(): Intents {
        return this._intents.current;
    }

    // Room of the power spawn it was last spawned at (spawn() records it).
    get birthName(): string | undefined {
        return this.memory.birth || this.memory.home;
    }

    // The room it works for: memory.home when a service set one, else birth.
    get homeName(): string | undefined {
        return this.memory.home || this.birthName;
    }

    get home(): Room | undefined {
        return this.homeName ? Game.rooms[this.homeName] : undefined;
    }

    // --- lifecycle -----------------------------------------------------------

    // Spawn at a power spawn and remember its room as the birth room (and as
    // home, when none is set).
    spawn(ps: StructurePowerSpawn): ScreepsReturnCode {
        const err = this.tryc.spawn(ps);
        if (err === OK) {
            this.memory.birth = ps.room.name;
            if (!this.memory.home) this.memory.home = ps.room.name;
        }
        return err;
    }

    renew(target: StructurePowerSpawn | StructurePowerBank): ScreepsReturnCode {
        return this.tryc.renew(target);
    }

    upgrade(power: PowerConstant): ScreepsReturnCode {
        return issue(this, "upgrade", () => this.tryc.upgrade(power), power);
    }

    rename(name: string): ScreepsReturnCode {
        return this.tryc.rename(name);
    }

    // Schedule (or with cancel=true undo) the account-level deletion.
    delete(cancel = false): ScreepsReturnCode {
        return this.tryc.delete(cancel);
    }

    suicide(): ScreepsReturnCode {
        return this.tryc.suicide();
    }

    notifyWhenAttacked(enabled: boolean): ScreepsReturnCode {
        return this.tryc.notifyWhenAttacked(enabled);
    }

    cancelOrder(method: string): ScreepsReturnCode {
        return this.tryc.cancelOrder(method);
    }

    // --- powers ----------------------------------------------------------------

    // One power a tick: the `power` intent. The wrappers below pass the
    // target type each power takes; usePower itself takes anything.
    usePower(power: PowerConstant, target?: RoomObject): ScreepsReturnCode {
        return issue(this, "power", () => this.tryc.usePower(power, target), power);
    }

    enableRoom(controller: StructureController): ScreepsReturnCode {
        return this.tryc.enableRoom(controller);
    }

    generateOps(): ScreepsReturnCode {
        return this.usePower(PWR_GENERATE_OPS);
    }

    operateSpawn(spawn: StructureSpawn): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_SPAWN, spawn);
    }

    operateTower(tower: StructureTower): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_TOWER, tower);
    }

    operateStorage(storage: StructureStorage): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_STORAGE, storage);
    }

    operateLab(lab: StructureLab): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_LAB, lab);
    }

    operateExtension(from: StructureStorage | StructureTerminal | StructureContainer): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_EXTENSION, from);
    }

    operateObserver(observer: StructureObserver): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_OBSERVER, observer);
    }

    operateTerminal(terminal: StructureTerminal): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_TERMINAL, terminal);
    }

    disruptSpawn(spawn: StructureSpawn): ScreepsReturnCode {
        return this.usePower(PWR_DISRUPT_SPAWN, spawn);
    }

    disruptTower(tower: StructureTower): ScreepsReturnCode {
        return this.usePower(PWR_DISRUPT_TOWER, tower);
    }

    disruptSource(source: Source): ScreepsReturnCode {
        return this.usePower(PWR_DISRUPT_SOURCE, source);
    }

    shield(): ScreepsReturnCode {
        return this.usePower(PWR_SHIELD);
    }

    regenSource(source: Source): ScreepsReturnCode {
        return this.usePower(PWR_REGEN_SOURCE, source);
    }

    regenMineral(mineral: Mineral): ScreepsReturnCode {
        return this.usePower(PWR_REGEN_MINERAL, mineral);
    }

    disruptTerminal(terminal: StructureTerminal): ScreepsReturnCode {
        return this.usePower(PWR_DISRUPT_TERMINAL, terminal);
    }

    operatePower(powerSpawn: StructurePowerSpawn): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_POWER, powerSpawn);
    }

    fortify(target: StructureRampart | StructureWall): ScreepsReturnCode {
        return this.usePower(PWR_FORTIFY, target);
    }

    operateController(controller: StructureController): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_CONTROLLER, controller);
    }

    operateFactory(factory: StructureFactory): ScreepsReturnCode {
        return this.usePower(PWR_OPERATE_FACTORY, factory);
    }

    // --- movement --------------------------------------------------------------

    // One step; the move intent is the direction. No moveTo or moveByPath:
    // walks go through the Rewalker (walkTo / walkRoom).
    moveDir(direction: DirectionConstant): ScreepsReturnCode {
        const err = this.tryc.move(direction);
        if (err === OK) this.intents.setMove(direction);
        else this.dlog("move", "failed", err);
        return err;
    }

    // Walk toward pos; OK once within range, a direction while moving, else an error.
    walkTo(pos: RoomPosition, range = 1): WalkReturnCode {
        return walkTo(this, pos, range);
    }

    // Toward the middle of a room until inside its 20-range core.
    walkRoom(roomName: string, range = 20): WalkReturnCode {
        return walkRoom(this, roomName, range);
    }

    // --- resources -------------------------------------------------------------

    withdraw(target: Structure | Tombstone | Ruin, resource: ResourceConstant, amount?: number): ScreepsReturnCode {
        return issue(this, "withdraw", () => this.tryc.withdraw(target, resource, amount), target);
    }

    transfer(target: AnyCreep | Structure, resource: ResourceConstant, amount?: number): ScreepsReturnCode {
        return issue(this, "transfer", () => this.tryc.transfer(target, resource, amount), target);
    }

    pickup(resource: Resource): ScreepsReturnCode {
        return issue(this, "pickup", () => this.tryc.pickup(resource), resource);
    }

    drop(resource: ResourceConstant, amount?: number): ScreepsReturnCode {
        return issue(this, "drop", () => this.tryc.drop(resource, amount), resource);
    }

    say(message: string, toPublic = false): ScreepsReturnCode {
        return issue(this, "say", () => this.tryc.say(message, toPublic), message);
    }

    // --- renew ------------------------------------------------------------------

    // Renew at a power spawn we happen to stand next to; no movement. Power
    // creeps live 5000 ticks per renew and die for good when TTL runs out.
    // Renew is not an intent slot (it conflicts with nothing), so a second
    // call in a tick just renews again.
    idleRenew(): boolean {
        const room = this.room;
        if (!room) return false;
        const ps = _.find(room.findStructs(STRUCTURE_POWER_SPAWN) as StructurePowerSpawn[], s => s.my && this.isNearTo(s));
        if (!ps) return false;
        return this.renew(ps) === OK;
    }

    // Walk to the power spawn in `roomName` (default: the home room) and
    // renew there. Returns a status string.
    runRenew(roomName = this.homeName): string {
        if (!roomName) return "renew: no home room";
        const pos = this.pos;
        if (!pos) return "renew: not spawned";
        if (pos.roomName !== roomName) {
            this.walkRoom(roomName);
            return `renew: to ${roomName}`;
        }
        const ps = _.find(this.room!.findStructs(STRUCTURE_POWER_SPAWN) as StructurePowerSpawn[], s => s.my);
        if (!ps) return `renew: no power spawn in ${roomName}`;
        if (!pos.isNearTo(ps)) {
            this.walkTo(ps.pos, 1);
            return "renew: to power spawn";
        }
        const err = this.renew(ps);
        return err === OK ? "renewed" : `renew failed ${err}`;
    }

    // --- swipe: loot a room's structures and haul home (swipe.ts) ----------------

    // The shared swipe quest, choosing targets by the value of what they hold
    // (a power creep's store is small and its life long), renewing at any
    // own power spawn passed on the way and grabbing what lies within reach
    // (swipe.nomNearby). A status string, or false once the creep is empty
    // and the target room has nothing left worth the trip (swipeworth.ts,
    // priced for homeRoom).
    questSwipe(targetRoom: string, homeRoom: string): string | false {
        this.idleRenew();
        const ret = swipe.questSwipe(this, targetRoom, homeRoom, swipeWorth(homeRoom), "value");
        swipe.nomNearby(this);
        return ret;
    }
}

// Registry: one wrapper per name for the life of the global, for my power
// creeps only (foreign ones are enemy.ts's). The wrapper exists whether the
// account has the creep or not; `exists` says.
const powerCreeps = new Map<string, MyPowerCreep>();
export function getPowerCreep(name: string): MyPowerCreep {
    let t = powerCreeps.get(name);
    if (!t) {
        t = new MyPowerCreep(name);
        powerCreeps.set(name, t);
    }
    return t;
}

// All of my power creeps, spawned or not.
export function myPowerCreeps(): MyPowerCreep[] {
    return _.keys(Game.powerCreeps).map(getPowerCreep);
}
