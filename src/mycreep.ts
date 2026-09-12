
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
export function task(prototype: any, name: string, desc: PropertyDescriptor) {
    const _name = "_task_" + name;
    prototype[_name] = prototype[name];
    prototype[name] = function (...args: any[]) {
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
        return prototype[_name].apply(this, args);
    };
}

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

    spawningRun() {}

    init(): boolean { return true }
    start(): Task2Ret {
        this.c.run();
        this.c.after();
        return "wait";
    }
    after() { }

    run(): boolean {
        if (!this.c) {
            return false;
        }

        this.init();
        let loops = 3;
        let ret: Task2Ret = "again";
        while ((ret === "again" || ret === "start") && loops > 0) {
            loops--;
            ret = this.runTask();
            if (ret === "start") {
                delete this.memory.task2;
                ret = this.start();
            }
        }
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