import { Registry, TObj } from "tobj";
import * as debug from "debug";

// TStruct: the TObj wrapper for structures, keyed by id, kept in one
// Registry (tobj.ts) shared by every subclass and instantiation (generics
// erase; the statics are TStruct's).
//
//   TStruct.make(structure)    the wrapper for a structure object
//   TStruct.makeId(id)         the wrapper an id already has, else null
//   t.s                        the structure this tick, else null
//   t.trys                     the structure this tick, else throws
//
// A subclass declares itself with `@register`: the structure type is its
// name less the leading T, camel-cased (TObserver -> observer, TPowerSpawn
// -> powerSpawn), and `make` builds that class for structures of the type,
// plain TStruct for any other. The module must be imported for the
// decorator to run. A wrapper already in the registry is whatever class
// first made it. For the result type, the subclass's module augments
// `Wrappers` (see tstruct.observer.ts).

// A structure type in six letters or fewer for notes and logs ("obser",
// "extn", "store"); struct.ts and constructionsite.ts use it too.
export function stype6(stype: StructureConstant): string {
    switch (stype) {
        case STRUCTURE_WALL:
            return "wall";
        case STRUCTURE_EXTENSION:
            return "extn";
        case STRUCTURE_STORAGE:
            return "store";
        case STRUCTURE_TERMINAL:
            return "term";
        case STRUCTURE_CONTAINER:
            return "contnr";
    }
    return stype.slice(0, 6);
}

declare global {
    interface RoomMemory {
        // TStruct.memory, by note (type + packed position), so it survives
        // a rebuild under a new id; dropped by TStruct.delete.
        structs?: { [note: string]: StructMemory }
    }
}

// What a TStruct keeps in Memory; subclasses augment it.
export interface StructMemory { }

// Structure type -> wrapper class, filled by @register.
const ctors = new Map<string, new (s: any) => TStruct<any>>();

// Structure type -> wrapper type, augmented by each subclass module:
//   declare module "tstruct" { interface Wrappers { observer: TObserver } }
export interface Wrappers { }

export type WrapperFor<S extends Structure> =
    S["structureType"] extends keyof Wrappers ? Wrappers[S["structureType"]] : TStruct<S>;

export function register<C extends new (s: any) => TStruct<any>>(ctor: C): C {
    const stype = _.camelCase(ctor.name.replace(/^T/, ""));
    if (ctors.has(stype)) debug.log("tstruct register: replacing", stype, "with", ctor.name);
    ctors.set(stype, ctor);
    return ctor;
}

// The registered wrapper class for a structure type, else TStruct.
export function wrapperClass(stype: StructureConstant): new (s: any) => TStruct<any> {
    return ctors.get(stype) || TStruct;
}

export class TStruct<S extends Structure = Structure> extends TObj<S> {
    static registry = new Registry<TStruct>("structs");

    readonly structType: StructureConstant;

    constructor(s: S) {
        super(s.id, s.pos);
        this.structType = s.structureType;
    }

    // The structure object this tick; null while it is out of sight or gone.
    get s(): S | null {
        return this.obj;
    }

    // The structure object this tick; throws when there is none.
    get trys(): S {
        return this.tryObj;
    }

    // The wrapper for `s`; a new one is of the class registered for its
    // structure type, else TStruct.
    static make<S extends Structure>(s: S): WrapperFor<S> {
        return TStruct.registry.get(s.id, () => new (wrapperClass(s.structureType))(s)) as unknown as WrapperFor<S>;
    }

    // The wrapper `id` already has, else null: without the structure object
    // there is nothing to make one from.
    static makeId<S extends Structure = Structure>(id: Id<S>): WrapperFor<S> | null {
        return TStruct.registry.peek(id) as unknown as WrapperFor<S> | null;
    }

    // Memory.rooms[room].structs[note], made on first read.
    get memory(): StructMemory {
        const rmem = Memory.rooms[this.roomName] = Memory.rooms[this.roomName] || {} as RoomMemory;
        const structs = rmem.structs = rmem.structs || {};
        return structs[this.note] = structs[this.note] || {};
    }

    // Drop the memory; the room's `structs` goes too once empty.
    delete(): void {
        const rmem = Memory.rooms[this.roomName];
        const structs = rmem?.structs;
        if (!structs) return;
        delete structs[this.note];
        if (_.isEmpty(structs)) delete rmem.structs;
    }

    // As struct.ts: a six-letter type plus the packed position ("obser3306"),
    // and toString wraps it in a link to the room for the console.
    get note(): string {
        return stype6(this.structType) + this.xy;
    }

    toString() {
        return `<a href="/a/#!/room/${Game.shard.name}/${this.roomName}">${this.note}</a>`;
    }
}
