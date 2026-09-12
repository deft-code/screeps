// Generic persistent wrapper for game objects. Design: docs/tcreep-design.md.
//
// A TObj is keyed by something stable across ticks (creep name, structure id,
// room name) and lives in a Registry for as long as its retirement policy says.
// The game object itself is re-resolved every tick through `lookup()`; nothing
// but keys, ids, names and packed positions may be kept across ticks.
import * as debug from "debug";
import { daemon, Priority, Process } from "process";

export type Key = string;

export const enum Life {
    egg = "egg",          // wrapper exists, the game object has never been seen
    alive = "alive",      // resolved this tick
    unseen = "unseen",    // did not resolve and the room is not visible: unknown
    dead = "dead",        // did not resolve while it should have: gone for good
    retired = "retired",  // dropped from its registry; do not use
}

export abstract class TObj<G extends { id?: string }> extends debug.Debuggable {
    private _tick = -1;
    private _obj: G | undefined;
    life = Life.egg;
    lastSeen = 0;
    died = 0;
    lastRoom?: string;
    lastXY?: number;

    constructor(readonly key: Key) {
        super();
    }

    // Resolve the game object for this tick, or undefined.
    protected abstract lookup(): G | undefined;
    // Whether a failed lookup proves the object is gone (true) or just unseen (false).
    protected abstract visible(): boolean;

    get obj(): G | undefined {
        if (this._tick !== Game.time) {
            this._tick = Game.time;
            const o = this.lookup();
            this._obj = o;
            if (o) {
                this.lastSeen = Game.time;
                this.life = Life.alive;
                this.observe(o);
            } else if (this.life === Life.alive || this.life === Life.unseen) {
                if (this.visible()) {
                    this.life = Life.dead;
                    this.died = Game.time;
                    this.onDead();
                } else {
                    this.life = Life.unseen;
                }
            }
        }
        return this._obj;
    }

    // Called every tick the object resolves. Record only ids and packed positions.
    protected observe(o: G) {
        const pos = (o as unknown as { pos?: RoomPosition }).pos;
        if (pos) {
            this.lastRoom = pos.roomName;
            this.lastXY = pos.x * 100 + pos.y;
        }
    }

    // Called once on the alive -> dead transition.
    protected onDead() { }

    get alive(): boolean {
        return this.obj !== undefined;
    }

    // Retirement policy; Registry.sweep drops wrappers that answer true.
    // Touch `alive` first so the life state is current for this tick.
    expired(): boolean {
        if (this.alive) return false;
        return this.life === Life.dead || this.life === Life.retired;
    }

    retire() {
        this.life = Life.retired;
        this._obj = undefined;
    }

    // Debuggable, made safe for wrappers whose memory is already gone.
    get debug() {
        const mem = this.memory as debug.DebugMemory | undefined;
        if (!mem) return false;
        if (mem.debug && Game.time < mem.debug) return true;
        delete mem.debug;
        return false;
    }

    set debug(value: boolean | number) {
        const mem = this.memory as debug.DebugMemory | undefined;
        if (!mem) return;
        if (!value) {
            delete mem.debug;
            return;
        }
        if (value === true) value = 500;
        if (_.isFinite(value)) mem.debug = Game.time + value;
    }

    toString() {
        return `${this.constructor.name}:${this.key}`;
    }
}

const registries: Registry<TObj<any>>[] = [];

export class Registry<T extends TObj<any>> {
    private readonly map = new Map<Key, T>();

    // `every`: sweep period in ticks (creeps every tick, structures rarely).
    constructor(readonly name: string, private readonly make: (key: Key) => T, readonly every = 1) {
        registries.push(this);
    }

    get(key: Key): T {
        return this.getOr(key, () => this.make(key));
    }

    getOr(key: Key, make: () => T): T {
        let t = this.map.get(key);
        if (!t) {
            t = make();
            this.map.set(key, t);
        }
        return t;
    }

    peek(key: Key): T | undefined {
        return this.map.get(key);
    }

    has(key: Key): boolean {
        return this.map.has(key);
    }

    forget(key: Key): boolean {
        const t = this.map.get(key);
        if (t) t.retire();
        return this.map.delete(key);
    }

    get size(): number {
        return this.map.size;
    }

    values(): IterableIterator<T> {
        return this.map.values();
    }

    // Drop every wrapper whose policy says it is done. Safe to delete while iterating a Map.
    sweep(): Key[] {
        const gone: Key[] = [];
        for (const [key, t] of this.map) {
            if (!t.expired()) continue;
            t.retire();
            this.map.delete(key);
            gone.push(key);
        }
        return gone;
    }
}

// One process sweeps every registry; runs in the `late` row after the missions.
@daemon
export class RetireDaemon extends Process {
    bucket = 1000;
    run(): Priority {
        for (const r of registries) {
            if (Game.time % r.every !== 0) continue;
            const gone = r.sweep();
            if (gone.length) debug.log("retired", r.name, gone.join(" "));
        }
        return "late";
    }
}
