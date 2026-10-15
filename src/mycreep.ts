
import * as debug from "debug";
import { NullStrat } from "strat";

interface Task2Memory {
    name: string
    id?: number
    args: (string | number)[]
}

declare global {
    interface CreepMemory {
        task2?: Task2Memory
        debug?: number
    }
}

export type Task2Ret = "again" | "start" | "wait" | false;

// Persist a resumable task in memory.task2. Arguments are JSON-cloned; the
// first argument that is a game object (has a string `id`) is stored by id and
// runTask swaps the live object back in (or restarts when it is gone).
// Decisions a creep may take in one tick: start() (or a per-tick step) is
// re-run while it answers "again" or "start", this many times at most.
const kPasses = 3;

export function task(prototype: any, name: string, desc: PropertyDescriptor) {
    const _name = "_task_" + name;
    const orig = desc.value;
    prototype[_name] = orig;
    // Set on the descriptor, not the prototype: TypeScript's __decorate
    // re-defines the method with this descriptor afterwards, so a wrapper
    // written straight to prototype[name] was thrown away (every @task
    // until 14 Oct 2026, see taskbroken).
    desc.value = function (this: any, ...args: any[]) {
        const mem: Task2Memory = { name, args: [] };
        args.forEach((arg, i) => {
            if (mem.id === undefined && arg && typeof arg === "object" && typeof arg.id === "string") {
                mem.id = i + 1;
                mem.args.push(arg.id);
                return;
            }
            mem.args.push(arg);
        });
        mem.args = JSON.parse(JSON.stringify(mem.args));
        this.memory.task2 = mem;
        return orig.apply(this, args);
    };
    return desc;
}

// What every @task was in practice until 14 Oct 2026: nothing. The
// decorator above wrote its wrapper to the prototype and returned no
// descriptor, so __decorate put the original method back and no task ever
// persisted; every job re-entered start() each tick. Jobs are moved back
// to @task one at a time, each checked for what its resume path skips
// (the flee, retarget and room checks its start() makes every tick), see
// docs/known-issues.md.
export function taskbroken(prototype: any, name: string, desc: PropertyDescriptor) { }

const mycreeps = new Map<string, MyCreep>();
const myroles = new Map<string, typeof MyCreep>();

// The registered job class for a role name ("paver"), or null.
export function getRoleClass(role: string): typeof MyCreep | null {
    return myroles.get(role.toLowerCase()) || null;
}

export function getRoleName(name: string): string {
    return _.first(_.words(name)).toLowerCase();
}

export function get<T extends MyCreep>(name: string): T {
    return getMyCreep(name) as T;
}

export function unget(name: string): boolean {
    return mycreeps.delete(name);
}

export function getMyCreep(name: string): MyCreep {
    if (mycreeps.has(name)) {
        return mycreeps.get(name)!;
    }
    const mycreep = makeCreep(name);
    mycreeps.set(name, mycreep);
    return mycreep;
}

function makeCreep(name: string): MyCreep {
    const role = getRoleName(name);
    const klass = myroles.get(role);
    if (!klass) {
        debug.log("Missing Role!", role);
        return new MyCreep(name);
    }
    return new klass(name);
}

export function registerAs(name: string) {
    return function(klass: typeof MyCreep) {
        return register_inner(klass, name);
    }
}

export function register(klass: typeof MyCreep) {
    const name = klass.name.toLowerCase();
    register_inner(klass, klass.name.toLowerCase());
}

function register_inner(klass: typeof MyCreep, name: string) {
    if (myroles.has(name)) {
        debug.log("Double Registry!!!", name);
        return;
    }
    myroles.set(name, klass);

}

export class MyCreep extends debug.Debuggable {
    constructor(readonly name: string) { super(); }

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return [null, []];
    }

    priority = 0;

    get pos(): RoomPosition {
        return this.c.pos;
    }

    toString(): string {
        if(this.memory.nest === 'egg') {
            if(_.isNumber(this.memory.egg)) return `egg${this.memory.egg}:${this.name}`;
            return `egg:${this.name}`;
        }
        return `<a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.name}</a>`;
    }

    get role(): string {
        return getRoleName(this.name);
    }

    get c(): Creep {
        return Game.creeps[this.name]!;
    }

    get memory(): CreepMemory {
        return Memory.creeps[this.name];
    }

    get ticksToLive() {
        return this.c?.ticksToLive || CREEP_LIFE_TIME;
    }

    get spawnTime() {
        return this.c?.spawnTime || 0;
    }

    eggRun() {
        this.log("Spoiled Egg!");
    }

    // Energy this creep will take as a hand-out from a passing hauler
    // (Trucker.idleShare): a creep with WORK parts takes whatever it has room
    // for, anything else takes none. Jobs override it to refuse at the
    // wrong time or place (Thoreater, Farmer at home, Pioneer away).
    donatable(): number {
        const c = this.c;
        if (!c || !c.getActiveBodyparts(WORK)) return 0;
        return c.store.getFreeCapacity(RESOURCE_ENERGY);
    }

    spawningRun() {}

    // The per-tick hook, called by run() before the stored task
    // (memory.task2) is resumed: the place for whatever must happen every
    // tick whatever the task is doing (a flee, a swing at an adjacent
    // enemy, mode tracking), and for jobs without task locks the whole of
    // the per-tick logic, start() left to return "wait". Return false to
    // say the task in flight is the wrong one for the situation: run()
    // drops it and decides afresh through start() this tick (a guard
    // locked on healing when an armed enemy walks in, a crow whose capture
    // flipped mode). Not for a flee: a fled task should resume once the
    // danger is gone (Warboy's fleeing flag), not be forgotten.
    init(): boolean { return true }
    start(): Task2Ret {
        this.c.run();
        this.c.after();
        return "wait";
    }
    after() { }

    // For a job that keeps its per-tick logic in init() rather than start()
    // (no task locks to persist yet; Skvulture was the first, Oct 2026): run
    // `step` the way run() runs start(), up to kPasses passes while it
    // answers "again" or "start" (a walk that arrives answers "start", so
    // the next decision follows in the same tick). The last answer.
    perTick(step: () => Task2Ret): Task2Ret {
        let loops = kPasses;
        let ret: Task2Ret = "again";
        while ((ret === "again" || ret === "start") && loops > 0) {
            loops--;
            ret = step();
        }
        return ret;
    }

    run(): boolean {
        if (!this.c) {
            return false;
        }

        // Only an explicit false: an init() that forgets to return must not
        // quietly switch persistence off for its job.
        if (this.init() === false) delete this.memory.task2;
        // Resume the task; "start" (none, or it ended) decides afresh.
        this.perTick(() => {
            const ret = this.runTask();
            if (ret !== "start") return ret;
            delete this.memory.task2;
            return this.start();
        });
        this.after();
        return true;
    }

    runTask(): Task2Ret {
        const task = this.memory.task2;
        if (!task) return "start";

        const taskFunc = (<any>this)[task.name] as Function;
        if (!_.isFunction(taskFunc)) return "start";

        const args = task.args.slice() as any[];
        if (task.id) {
            const obj = Game.getObjectById(args[task.id - 1]);
            if (!obj) return "start";
            args[task.id - 1] = obj;
        }
        return taskFunc.apply(this, args);
    }

    delete() {
        mycreeps.delete(this.name);
    }
}