// Generic heap wrapper for game objects, keyed by id, and the registry that
// keeps the wrappers between ticks. Design: docs/tcreep-design.md (this is
// the spike's tobj.ts without lifecycle tracking or the sweep daemon).
//
// A wrapper keeps nothing of the game object but its id and the position it
// was made at: `obj` re-resolves it through Game.getObjectById every time. A Registry holds wrappers in two
// maps, `hot` for those whose object resolved at the last collection (or
// were fetched since) and `cold` for those whose object was missing then.
// Every fetch (`get`, `peek`) first runs a collection if one is due, which
// re-sorts both maps: a cold wrapper whose object is back goes hot, a hot
// wrapper whose object is gone goes cold, and a cold wrapper still missing
// is dropped and `delete`d. So an object out of sight for one period
// survives, and one missing for two periods is forgotten, Memory included.

// Collections are `period` to 2 * `period` ticks apart (the jitter is a
// second random period), so registries made together drift apart.
export const kGarbagePeriod = 500;

export abstract class TObj<T extends _HasId> {
    // A copy of the position the wrapper was made at, not the game object's
    // own RoomPosition: that object is rebuilt every tick, and holding it
    // would keep the whole tick's game object alive with the wrapper.
    readonly pos: RoomPosition;

    constructor(readonly id: Id<T>, pos: RoomPosition) {
        this.pos = new RoomPosition(pos.x, pos.y, pos.roomName);
    }

    // The position packed (RoomPosition.xy, path.ts).
    get xy(): number {
        return this.pos.xy;
    }

    get roomName(): string {
        return this.pos.roomName;
    }

    // The game object this tick, else null (out of sight or gone).
    get obj(): T | null {
        return Game.getObjectById(this.id);
    }

    // The game object this tick; throws when there is none.
    get tryObj(): T {
        const o = this.obj;
        if (!o) throw new Error(`${this}: no game object`);
        return o;
    }

    // Drop whatever the wrapper keeps outside the heap (its Memory). The
    // Registry calls it when it purges the wrapper.
    abstract delete(): void;

    toString() {
        return `${this.constructor.name}:${this.id}`;
    }
}

export class Registry<T extends TObj<any>> {
    // Wrappers whose object resolved at the last collection or were fetched since.
    hot = new Map<string, T>();
    // Wrappers whose object was missing at the last collection.
    cold = new Map<string, T>();
    // The tick the next collection is due; 0 collects on the first fetch.
    garbageCounter = 0;

    constructor(readonly name: string, readonly period = kGarbagePeriod) { }

    // The wrapper for `id`: the hot one, else the cold one made hot again,
    // else `make()`, stored hot.
    get(id: string, make: () => T): T {
        this._garbageCollect();
        let t = this.hot.get(id);
        if (t) return t;
        t = this.cold.get(id);
        if (t) {
            this.cold.delete(id);
        } else {
            t = make();
        }
        this.hot.set(id, t);
        return t;
    }

    // The wrapper `id` already has (hot, or cold and made hot again), else null.
    peek(id: string): T | null {
        this._garbageCollect();
        let t = this.hot.get(id);
        if (t) return t;
        t = this.cold.get(id);
        if (!t) return null;
        this.cold.delete(id);
        this.hot.set(id, t);
        return t;
    }

    has(id: string): boolean {
        return this.hot.has(id) || this.cold.has(id);
    }

    forget(id: string): boolean {
        return this.hot.delete(id) || this.cold.delete(id);
    }

    get size(): number {
        return this.hot.size + this.cold.size;
    }

    // Once the counter has passed: re-sort both maps by whether each
    // wrapper's object resolves, as described above, and set the next due tick.
    _garbageCollect() {
        if (this.garbageCounter >= Game.time) return;
        const hot = new Map<string, T>();
        const cold = new Map<string, T>();
        for (const [id, t] of this.cold) {
            if (t.obj) hot.set(id, t);
            else t.delete(); // gone for two periods: dropped, Memory included
        }
        for (const [id, t] of this.hot) {
            if (t.obj) hot.set(id, t);
            else cold.set(id, t);
        }
        this.hot = hot;
        this.cold = cold;
        this.garbageCounter = Game.time + this.period + _.random(this.period);
    }
}
