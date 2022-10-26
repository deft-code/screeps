import { Service, Priority} from "process";
import * as debug from "debug";
import { getMyCreep, unget } from "mycreep";


declare global {
    interface Memory {
        missions: {
            [key: string]: MissionMemory
        }
    }
}

interface MissionMemory {
    creeps: string[]
    hatch: string[]
    eggs: string[]
}



export abstract class Mission extends Service {
    constructor(name: string) {
        super(name);
        Memory.missions[name] = Memory.missions[name] || {
            creeps: [],
            hatch: [],
            eggs: [],
        };
    }

    abstract get roomName(): string;

    get eggs() {
        return _.map(this.memory.eggs, c => getMyCreep(c));
    }

    get creeps() {
        return _.map(this.memory.creeps, c => getMyCreep(c));
    }

    get memory(): MissionMemory {
        return Memory.missions[this.name];
    }

    roleCreeps(role: string) {
        return this.creeps.filter(c => c.role === role);
    }

    roleEggs(role: string) {
        return this.eggs.filter(egg => egg.role === role);
    }

    run(): Priority {
        this.hatchEggs();
        this.spawnHatches();
        this.runCreeps();
        return super.run();
    }

    hatchEggs() {
        const done: string[] = [];
        for (const name of this.memory.eggs) {
            if (Game.creeps[name]) {
                debug.log("hatching", name);
                done.push(name);
                this.memory.hatch.push(name);
            }
        }
        if (done.length) {
            _.remove(this.memory.eggs, egg => _.contains(done, egg));
        }
    }

    spawnHatches() {
        const done: string[] = [];
        for (const name of this.memory.hatch) {
            if (!Game.creeps[name]) {
                done.push(name);
                debug.log("Lost Hatch!", name);
            }
            if (!Game.creeps[name]?.spawning) {
                debug.log("Creep Spawned!", name);
                done.push(name);
                this.memory.creeps.push(name);
            }
        }
        if (done.length) {
            _.remove(this.memory.hatch, h => _.contains(done, h));
        }
    }

    runCreeps() {
        const done: string[] = [];
        for (const name of this.memory.creeps) {
            const c = getMyCreep(name)
            if (!c.run()) {
                done.push(name);
            }
        }
        for (const name of done) {
            debug.log("Creep Died!", name);
            delete Memory.creeps[name];
            unget(name);
        }
        if (done.length) {
            _.remove(this.memory.creeps, c => _.contains(done, c));
        }
    }

    hasEgg(role: string) {
        return _.any(this.memory.eggs, egg => getMyCreep(egg).role === role);
    }

    hasRole(role: string) {
        return _.any(this.memory.creeps, c => getMyCreep(c).role === role) ||
            _.any(this.memory.hatch, egg => getMyCreep(egg).role === role);
    }

    // This spawns creeps no faster than a fixed rate.
    nCreepsPace(role: string, n: number, life = CREEP_LIFE_TIME) {
        const sleep = life / n;
        if (!this.roleEggs(role).length) {
            const creeps = this.roleCreeps(role);
            if (!creeps.length) {
                return this.layEgg(role);
            }
            const spawnlag = _.max(creeps, c => c.spawnTime)?.spawnTime || 0;
            const egg = this.layEgg(role);
            egg.memory.hibernate = Math.ceil(Game.time + sleep + _.random(10) - spawnlag);
            return egg;
        }
        return null;
    }

    nCreeps(role: string, n: number, life = CREEP_LIFE_TIME) {
        const neededttl = (n - 1) * life;
        // a neededttl of 1500 creates 2 creeps
        // a neededttl of 0 spawns replacement as the first dies.
        if (neededttl <= 0) return this.nCreepsPace(role, n);

        const creeps = this.roleCreeps(role);
        const spawnlag = _.max(creeps, c => c.spawnTime)?.spawnTime || 0;
        const total = _.sum(creeps, c => c.ticksToLive)
            + this.roleEggs(role).length * life
            + _.random(10) - spawnlag;
        debug.log(`total:${total} vs needed:${neededttl}`);
        if (total >= neededttl + spawnlag) return null;
        return this.layEgg(role);
    }

    layEgg(role: string) {
        const name = findName(role);
        this.memory.eggs.push(name);
        Memory.creeps[name] = {
            laid: Game.time,
            cpu: 0,
            mission: this.name,
            home: "egg",
            birth: Game.time,
            nest: "egg",
        };
        return getMyCreep(name);
    }
}

let lasti = 0
function findName(role: string): string {
    const n = _.size(Memory.creeps);
    const nn = n + 1

    for (let i = 0; i < nn; i++) {
        const ii = i + lasti % nn;
        const name = role + ii;
        if (!Memory.creeps[name]) {
            lasti = i
            return name
        }
    }
    debug.log('failed to find creep name', role, n)
    return role + Game.time
}

declare global {
    interface CreepMemory {
        mission: string
        birth: number
    }
}