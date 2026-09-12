// Persistent wrapper for a structure, keyed by id. Design: docs/tcreep-design.md, phase 2.
//
// Shows that the TObj base covers id-keyed objects too: lookup through
// Game.getObjectById, death confirmed only while the room is visible, per-tick
// claims as instance state (replacing struct.tick.*), and config memory keyed by
// position so a rebuilt structure inherits it (as Link.mode does today).
import { Life, Registry, TObj } from "tobj";

export interface StructMemory {
    debug?: number
    [key: string]: any
}

declare global {
    interface RoomMemory {
        structs?: { [xy: string]: StructMemory }
    }
}

// Wrappers for structures in rooms we have not seen for this long are dropped.
const UNSEEN_MAX_AGE = 20000;

export class TStruct<S extends Structure = Structure> extends TObj<S> {
    constructor(readonly id: Id<S>, roomName?: string, xy?: number) {
        super(id);
        if (roomName !== undefined) {
            this.lastRoom = roomName;
            this.lastXY = xy;
            this.life = Life.unseen;
        }
    }

    protected lookup(): S | undefined {
        return Game.getObjectById(this.id) || undefined;
    }

    // A structure can only be declared dead when its room is in view.
    protected visible(): boolean {
        return !!this.lastRoom && !!Game.rooms[this.lastRoom];
    }

    get s(): S {
        const s = this.obj;
        if (!s) throw new Error(`${this.id} is ${this.life}: no structure object`);
        return s;
    }

    // Config that must survive a rebuild is keyed by position, not id.
    get memory(): StructMemory {
        if (this.lastRoom === undefined || this.lastXY === undefined) return {};
        const rmem = (Memory.rooms[this.lastRoom] = Memory.rooms[this.lastRoom] || ({} as RoomMemory));
        const structs = (rmem.structs = rmem.structs || {});
        return (structs[this.lastXY] = structs[this.lastXY] || {});
    }

    // Per-tick claims: "hauler3 is transferring into me this tick". Replaces struct.tick.transfer etc.
    private _claimTick = -1;
    private _claims: { [kind: string]: string } = {};

    claim(kind: string, who: string): boolean {
        if (this._claimTick !== Game.time) {
            this._claimTick = Game.time;
            this._claims = {};
        }
        const current = this._claims[kind];
        if (current && current !== who) return false;
        this._claims[kind] = who;
        return true;
    }

    claimedBy(kind: string): string | undefined {
        return this._claimTick === Game.time ? this._claims[kind] : undefined;
    }

    expired(): boolean {
        if (this.life === Life.dead || this.life === Life.retired) return true;
        return this.life === Life.unseen && Game.time - this.lastSeen > UNSEEN_MAX_AGE;
    }

    toString(): string {
        const s = this.obj;
        if (s) return `${s}`;
        return `${this.life}:${this.constructor.name}@${this.lastRoom}:${this.lastXY}`;
    }
}

// Registration by structure type; unknown types get the plain TStruct.
type StructCtor = new (id: Id<any>, roomName?: string, xy?: number) => TStruct<any>;
const structClasses = new Map<StructureConstant, StructCtor>();

export function registerStruct(stype: StructureConstant) {
    return function (klass: StructCtor) {
        structClasses.set(stype, klass);
    };
}

const structs = new Registry<TStruct>("structs", id => new TStruct(id as Id<Structure>), 20);

// Wrapper for a structure found through the game API this tick.
export function tstruct<S extends Structure>(s: S): TStruct<S> {
    return structs.getOr(s.id, () => {
        const klass = structClasses.get(s.structureType) || TStruct;
        return new klass(s.id, s.pos.roomName, s.pos.x * 100 + s.pos.y);
    }) as TStruct<S>;
}

// Wrapper for a remembered structure id, whether or not it is visible now.
export function tstructById<S extends Structure>(id: Id<S>, roomName?: string, xy?: number): TStruct<S> {
    return structs.getOr(id, () => new TStruct<S>(id, roomName, xy)) as TStruct<S>;
}

@registerStruct(STRUCTURE_TOWER)
export class TTower extends TStruct<StructureTower> {
    get energy(): number {
        return this.s.store.energy;
    }
}
