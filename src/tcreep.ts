// TCreep: the TAnyCreep wrapper for Creeps of any owner, and EnemyCreep, the
// id-keyed one for everyone else's that lives in the enemy registry
// (enemy.ts). MyCreep (mycreep.ts) is the one for mine.
//
// The body statistics are the CreepExtra getters on Creep.prototype
// (creep.ts), read through the game object, so there is one implementation;
// each reader here answers its empty value (0, false, an empty Map) while
// there is no object.
import type { CreepExtra } from "creep";
import { CreepKind, TAnyCreep } from "tanycreep";
import type { DebugMemory } from "debug";

export abstract class TCreep extends TAnyCreep<Creep> {
    readonly kind: CreepKind = "creep";

    // The Creep with creep.ts's extras typed.
    protected get extra(): CreepExtra | null {
        return this.c as CreepExtra | null;
    }

    get body(): BodyPartDefinition[] {
        return this.c?.body ?? [];
    }

    get fatigue(): number {
        return this.c?.fatigue ?? 0;
    }

    get spawning(): boolean {
        return this.c?.spawning ?? false;
    }

    get partsByType(): Map<BodyPartConstant, number> {
        return this.extra?.partsByType ?? new Map();
    }

    get activeByType(): Map<BodyPartConstant, number> {
        return this.extra?.activeByType ?? new Map();
    }

    // Parts of a type, all and unhurt.
    parts(type: BodyPartConstant): number {
        return this.partsByType.get(type) || 0;
    }

    active(type: BodyPartConstant): number {
        return this.activeByType.get(type) || 0;
    }

    hasActivePart(...types: BodyPartConstant[]): boolean {
        return _.any(types, t => this.active(t) > 0);
    }

    get melee(): boolean {
        return this.extra?.melee ?? false;
    }

    get ranged(): boolean {
        return this.extra?.ranged ?? false;
    }

    // Armed: melee or ranged.
    get hostile(): boolean {
        return this.extra?.hostile ?? false;
    }

    // An NPC Source Keeper.
    get keeper(): boolean {
        return this.extra?.keeper ?? false;
    }

    // Armed, or built to dismantle or heal.
    get assault(): boolean {
        return this.extra?.assault ?? false;
    }

    // Boosted parts.
    get nBoosted(): number {
        return _.sum(this.body, b => b.boost ? 1 : 0);
    }

    // Fatigue a move generates.
    get weight(): number {
        return this.extra?.weight ?? 0;
    }

    // Ticks the body takes to spawn; 0 with no body.
    get spawnTime(): number {
        return CREEP_SPAWN_TIME * this.body.length;
    }

    get where(): string {
        const pos = this.c?.pos ?? this.lastPos;
        if (!pos) return "nowhere";
        return `<a href="/a/#!/room/${Game.shard.name}/${pos.roomName}">${pos.roomName}</a>`;
    }
}

// Someone else's creep, keyed by id and resolved through Game.getObjectById,
// so it is known only while in sight; between sightings `pos` is where it was
// last seen. Made and kept by enemy.ts (enemyOf), swept by its Registry; the
// wrapper has no Memory, its debug flag lives on the heap.
export class EnemyCreep extends TCreep {
    private readonly _id: Id<Creep>;
    private _pos: RoomPosition;
    private readonly _mem: DebugMemory = {};

    constructor(c: Creep) {
        super(c.name);
        this._id = c.id;
        this._pos = new RoomPosition(c.pos.x, c.pos.y, c.pos.roomName);
    }

    protected lookup(): Creep | null {
        const c = Game.getObjectById(this._id);
        if (!c || c.my) return null;
        this._pos = c.pos;
        return c;
    }

    get id(): Id<Creep> {
        return this._id;
    }

    get my(): boolean {
        return false;
    }

    // Live, else where it was last seen.
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

    // Registry hook: nothing outside the heap to drop.
    delete(): void { }

    toString(): string {
        const c = this.c;
        if (c) return `<a href="/a/#!/room/${Game.shard.name}/${c.pos.roomName}">${this.owner}:${this.name}</a>`;
        return `[enemy ${this.name} last ${this.roomName} ${Game.time - this.lastSeen} ago]`;
    }
}
