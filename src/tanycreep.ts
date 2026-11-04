// TAnyCreep: the base every creep and power creep wrapper shares, mine or
// anyone's. Design: docs/tcreep-design.md (section 2, "the wrapper model").
//
// A wrapper is keyed by the creep's name and keeps nothing of the game
// object across ticks but its last position: `c` re-resolves the Creep or
// PowerCreep once per tick through the subclass's lookup() and answers null
// when there is none this tick (an egg, an unspawned power creep, an enemy
// out of sight or dead). Every reader on the base is null-safe with a sane
// default (hits 0, hurts 0, store null, pos null, effects []), so lifecycle
// and inspection code never has to test `c` first; `tryc` is the asserting
// accessor for code that only runs while the object exists.
//
//   TAnyCreep<G>                 this file: lookup, per-tick cache, the shared readers
//    ├ TCreep (tcreep.ts)         body stats; EnemyCreep (id-keyed, in the enemy registry)
//    │   └ MyCreep (mycreep.ts)   intents, API wrappers, home/birth, the Task2 lifecycle
//    └ TPowerCreep (powercreep.ts) powers, level; EnemyPowerCreep; MyPowerCreep
//
// What MyCreep and MyPowerCreep share beyond this base (per-tick intents,
// the API wrappers, home and birth rooms, walking) is the MyBaseCreep
// contract in mybasecreep.ts.
import * as debug from "debug";

export type CreepKind = "creep" | "powerCreep";

// Anything with a position: a RoomPosition or a game object.
export type Target = RoomPosition | { pos: RoomPosition };

export abstract class TAnyCreep<G extends AnyCreep = AnyCreep> extends debug.Debuggable {
    private _tick = -1;
    private _c: G | null = null;
    // Tick the object last resolved; -1 never.
    lastSeen = -1;
    // Where it stood then (packed x * 100 + y), for a wrapper whose object is gone.
    lastRoom?: string;
    lastXY?: number;

    constructor(readonly name: string) {
        super();
    }

    abstract readonly kind: CreepKind;

    // The game object this tick, or nothing. The only place it is fetched.
    protected abstract lookup(): G | null | undefined;

    // lookup() once per tick, recording where the object was seen.
    protected resolve(): G | null {
        if (this._tick !== Game.time) {
            this._tick = Game.time;
            const c = this.lookup() || null;
            this._c = c;
            if (c) {
                this.lastSeen = Game.time;
                if (c.pos) {
                    this.lastRoom = c.pos.roomName;
                    this.lastXY = c.pos.x * 100 + c.pos.y;
                }
            }
        }
        return this._c;
    }

    // The Creep or PowerCreep this tick, else null.
    get c(): G | null {
        return this.resolve();
    }

    // The game object this tick; throws when there is none.
    get tryc(): G {
        const c = this.c;
        if (!c) throw new Error(`${this.name}: no ${this.kind} object this tick`);
        return c;
    }

    // TObj's names for the same two, so a wrapper fits a tobj.ts Registry.
    get obj(): G | null {
        return this.c;
    }

    get tryObj(): G {
        return this.tryc;
    }

    get exists(): boolean {
        return this.c !== null;
    }

    get isPowerCreep(): boolean {
        return this.kind === "powerCreep";
    }

    // --- readers, null-safe ----------------------------------------------------

    get id(): Id<G> | undefined {
        return this.c?.id as Id<G> | undefined;
    }

    // Where it stands this tick; null while there is no object or it is not
    // in a room (an unspawned power creep).
    get pos(): RoomPosition | null {
        return this.c?.pos ?? null;
    }

    // Where it stood when last seen, else null.
    get lastPos(): RoomPosition | null {
        if (this.lastRoom === undefined || this.lastXY === undefined) return null;
        return new RoomPosition(Math.floor(this.lastXY / 100), this.lastXY % 100, this.lastRoom);
    }

    get room(): Room | null {
        return this.c?.room ?? null;
    }

    get my(): boolean {
        return this.c?.my ?? false;
    }

    get owner(): string | undefined {
        return this.c?.owner?.username;
    }

    get hits(): number {
        return this.c?.hits ?? 0;
    }

    get hitsMax(): number {
        return this.c?.hitsMax ?? 0;
    }

    get hurts(): number {
        return this.hitsMax - this.hits;
    }

    // 0 with no object (an unspawned power creep, a spawning creep).
    get ticksToLive(): number {
        return this.c?.ticksToLive ?? 0;
    }

    get store(): StoreDefinition | null {
        return this.c?.store ?? null;
    }

    // Units aboard, of everything.
    get carried(): number {
        return this.store?.getUsedCapacity() ?? 0;
    }

    // Free space, for anything.
    get free(): number {
        return this.store?.getFreeCapacity() ?? 0;
    }

    get saying(): string | undefined {
        return this.c?.saying;
    }

    get effects(): RoomObjectEffect[] {
        return this.c?.effects ?? [];
    }

    // Ticks the effect has left; 0 when it is not on.
    effectTTL(effect: PowerConstant | EffectConstant): number {
        const active = _.find(this.effects, e => e.effect === effect);
        return active ? active.ticksRemaining : 0;
    }

    // --- geometry, false/Infinity with no position --------------------------------
    // Off the live object rather than `pos`, which MyCreep narrows to the
    // asserting form: these answer their default for an egg too.

    isNearTo(target: Target): boolean {
        const pos = this.c?.pos;
        return !!pos && pos.isNearTo(target as RoomPosition);
    }

    inRangeTo(target: Target, range: number): boolean {
        const pos = this.c?.pos;
        return !!pos && pos.inRangeTo(target as RoomPosition, range);
    }

    isEqualTo(target: Target): boolean {
        const pos = this.c?.pos;
        return !!pos && pos.isEqualTo(target as RoomPosition);
    }

    getRangeTo(target: Target): number {
        const pos = this.c?.pos;
        return pos ? pos.getRangeTo(target as RoomPosition) : Infinity;
    }

    toString(): string {
        const pos = this.c?.pos;
        if (pos) return `<a href="/a/#!/room/${Game.shard.name}/${pos.roomName}">${this.name}</a>`;
        return `[${this.kind} ${this.name}${this.exists ? "" : " (missing)"}]`;
    }
}
