// Persistent wrapper for one of my creeps, keyed by creep name. Design: docs/tcreep-design.md.
//
// The wrapper exists before the creep does (egg), while it lives, and for a short
// time after it dies (tombstone phase). Role logic lives in subclasses; nothing is
// injected into Creep.prototype.
import { Life, TObj } from "tobj";
import { Service } from "process";
import type { Mission } from "mission";

declare global {
    interface CreepMemory {
        id?: Id<Creep>      // recorded on first sight; needed to find the tombstone later
        lastRoom?: string   // last room the creep was seen in (written only on change)
        died?: number       // first tick the creep was missing
    }
}

// Eggs that never hatch and corpses whose tombstone is gone are retired.
const EGG_MAX_AGE = 3000;
const TOMB_MAX_AGE = TOMBSTONE_DECAY_PER_PART * MAX_CREEP_SIZE;

export function getRoleName(name: string): string {
    return _.first(_.words(name)).toLowerCase();
}

// Every Creep member the legacy mixins reach through `this.` (see spike/surface.js),
// plus the rest of the Creep API for uniformity. `name`, `id`, `memory`, `ticksToLive`
// and `spawnTime` are deliberately absent: the wrapper owns those.
const FORWARDED_PROPS = [
    "pos", "room", "store", "body", "hits", "hitsMax", "fatigue", "my", "owner", "spawning", "saying",
    "effects", "carry", "carryCapacity", "tick", "cache",
] as const;
const FORWARDED_METHODS = [
    "attack", "attackController", "build", "cancelOrder", "claimController", "dismantle", "drop",
    "generateSafeMode", "getActiveBodyparts", "harvest", "heal", "move", "moveByPath", "moveTo",
    "notifyWhenAttacked", "pickup", "pull", "rangedAttack", "rangedHeal", "rangedMassAttack", "repair",
    "reserveController", "say", "signController", "suicide", "transfer", "upgradeController", "withdraw",
] as const;
type ForwardedProp = typeof FORWARDED_PROPS[number];
type ForwardedMethod = typeof FORWARDED_METHODS[number];

// Declaration merge: the wrapper presents the creep's own API, so mixin bodies written
// against `this: Creep` compile unchanged. The runtime forwarders are defined below.
export interface TCreep extends Pick<Creep, ForwardedProp | ForwardedMethod> { }

export class TCreep extends TObj<Creep> {
    constructor(readonly name: string) {
        super(name);
        // Rebuilt after a global reset: a creep that has memory but no object is a corpse.
        const mem = this.memory;
        if (mem && mem.nest !== "egg" && !Game.creeps[name]) {
            this.life = Life.dead;
            this.died = mem.died || Game.time;
        }
    }

    protected lookup(): Creep | undefined {
        return Game.creeps[this.name];
    }

    // Game.creeps is complete for my creeps: absence means death.
    protected visible(): boolean {
        return true;
    }

    protected observe(c: Creep) {
        super.observe(c);
        const mem = this.memory;
        if (!mem) return;
        if (!mem.id) mem.id = c.id;
        if (mem.lastRoom !== c.pos.roomName) mem.lastRoom = c.pos.roomName;
    }

    protected onDead() {
        const mem = this.memory;
        if (mem && !mem.died) mem.died = Game.time;
    }

    // Mirrors the engine's lazy Creep.memory, but only for a creep that exists:
    // a retired or dead wrapper must never resurrect deleted memory.
    get memory(): CreepMemory {
        let mem = Memory.creeps[this.name];
        if (!mem && this.life !== Life.retired && Game.creeps[this.name]) {
            mem = Memory.creeps[this.name] = {} as CreepMemory;
        }
        return mem;
    }

    // The live creep. Only valid while alive; role code runs only then.
    get c(): Creep {
        const c = this.obj;
        if (!c) throw new Error(`${this.name} is ${this.life}: no creep object`);
        return c;
    }

    get id(): Id<Creep> | undefined {
        const c = this.obj;
        if (c) return c.id;
        const mem = this.memory;
        return mem ? mem.id : undefined;
    }

    get role(): string {
        return getRoleName(this.name);
    }

    // Eggs count as a full life so population maths (Mission.nCreeps) keep working.
    get ticksToLive(): number {
        const c = this.obj;
        return (c && c.ticksToLive) || CREEP_LIFE_TIME;
    }

    get spawnTime(): number {
        const c = this.obj;
        return c ? CREEP_SPAWN_TIME * c.body.length : 0;
    }

    get hatching(): boolean {
        const c = this.obj;
        return !!c && c.spawning;
    }

    get mission(): Mission | undefined {
        const mem = this.memory;
        if (!mem || !mem.mission) return undefined;
        return Service.getType<Mission>(mem.mission) || undefined;
    }

    private _tombId?: Id<Tombstone>;

    // The tombstone left by this creep, while it exists and its room is visible.
    tombstone(): Tombstone | null {
        if (this.alive) return null;
        const id = this.id;
        if (!id) return null;
        if (this._tombId) {
            const t = Game.getObjectById(this._tombId);
            if (t) return t;
        }
        const mem = this.memory;
        const roomName = this.lastRoom || (mem && mem.lastRoom);
        const room = roomName ? Game.rooms[roomName] : undefined;
        if (!room) return null;
        const tomb = _.find(room.find(FIND_TOMBSTONES), t => t.creep.id === id) || null;
        if (tomb) this._tombId = tomb.id;
        return tomb;
    }

    expired(): boolean {
        if (this.alive) return false;
        switch (this.life) {
            case Life.retired:
                return true;
            case Life.egg: {
                const mem = this.memory;
                if (!mem) return true;
                const since = Math.max(mem.laid, mem.hibernate || 0);
                return Game.time - since > EGG_MAX_AGE;
            }
            case Life.dead: {
                if (Game.time - this.died > TOMB_MAX_AGE) return true;
                const mem = this.memory;
                const roomName = this.lastRoom || (mem && mem.lastRoom);
                const room = roomName ? Game.rooms[roomName] : undefined;
                // The corpse is confirmed gone once the room is visible and shows no tombstone.
                return !!room && !this.tombstone();
            }
        }
        return false;
    }

    // Retirement frees the name: memory is deleted here, not at death.
    retire() {
        super.retire();
        delete Memory.creeps[this.name];
    }

    toString(): string {
        const c = this.obj;
        if (c) return `<a href="/a/#!/room/${Game.shard.name}/${c.pos.roomName}">${this.name}</a>`;
        if (this.life === Life.egg) {
            const mem = this.memory;
            const n = mem && mem.egg;
            return _.isNumber(n) ? `egg${n}:${this.name}` : `egg:${this.name}`;
        }
        return `${this.life}:${this.name}`;
    }
}

// Runtime half of the declaration merge above.
for (const prop of FORWARDED_PROPS) {
    Object.defineProperty(TCreep.prototype, prop, {
        get(this: TCreep) { return (this.c as any)[prop]; },
        configurable: true,
    });
}
for (const method of FORWARDED_METHODS) {
    (TCreep.prototype as any)[method] = function (this: TCreep, ...args: any[]) {
        return (this.c as any)[method](...args);
    };
}
