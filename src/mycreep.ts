
import * as debug from "debug";
import { NullStrat } from "strat";

const mycreeps = new Map<string, MyCreep>();
const myroles = new Map<string, typeof MyCreep>();

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
    if(!klass) {
        debug.log("Missing Role!", role);
        return new MyCreep(name);
    }
    return new klass(name);
}

export function register(klass: typeof MyCreep) {
    const name = klass.prototype.constructor.name.toLowerCase();
    if (myroles.has(name)) {
        debug.log("Double Registry!!!", name );
        return;
    }
    myroles.set(name, klass);
}

export class MyCreep {
    constructor(readonly name: string) { }

    spawn(spawns: StructureSpawn[]): [StructureSpawn|null, BodyPartConstant[]] {
        return [null, []];
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

    run(): boolean {
        if (!this.c) {
            return false;
        }
        this.c.run();
        this.c.after();
        return true;
    }



    delete() {
        mycreeps.delete(this.name);
    }
}