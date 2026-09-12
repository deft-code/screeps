// Spike version of src/mycreep.ts + job.creep.ts + job.role.ts folded into one fat
// wrapper class. Design: docs/tcreep-design.md.
//
// Chain: TCreep -> CreepStats -> CreepRole -> CreepMove -> CreepCarry -> CreepHarvest
//        -> CreepBuild -> CreepRepair -> MyCreep (+ every legacy JS mixin merged onto
//        MyCreep.prototype) -> one class per role.
import * as debug from "debug";
import * as lib from "lib";
import { Registry } from "tobj";
import { getRoleName } from "tcreep";
import { CreepRepair } from "t.creep.repair";
import { defaultRewalker, fromXY } from "Rewalker";
import { findSpawns, buildBody } from "spawnold";
import { TaskRet } from "Tasker";

// CreepMemory.task2 / .debug are declared by src/mycreep.ts (still compiled here).

export type Task2Ret = "again" | "start" | "wait" | false;

// Persist a resumable task: records the method name and JSON-cloned args in memory.task2.
export function task(prototype: any, name: string, desc: PropertyDescriptor) {
    const _name = "_task_" + name;
    prototype[_name] = prototype[name];
    prototype[name] = function () {
        this.memory.task2 = {
            name,
            args: JSON.parse(JSON.stringify(arguments)),
        };
        return prototype[_name].apply(this, arguments);
    };
}

// Role registry: creep name prefix -> wrapper class.
const myroles = new Map<string, typeof MyCreep>();

function makeCreep(name: string): MyCreep {
    const role = getRoleName(name);
    const klass = myroles.get(role);
    if (!klass) {
        debug.log("Missing Role!", role);
        return new MyCreep(name);
    }
    return new klass(name);
}

// The wrapper registry; swept every tick by RetireDaemon (tobj.ts).
export const creeps = new Registry<MyCreep>("creeps", makeCreep);

export function getMyCreep(name: string): MyCreep {
    return creeps.get(name);
}

export function get<T extends MyCreep>(name: string): T {
    return creeps.get(name) as T;
}

export function unget(name: string): boolean {
    return creeps.forget(name);
}

export function registerAs(name: string) {
    return function (klass: typeof MyCreep) {
        register_inner(klass, name);
    };
}

export function register(klass: typeof MyCreep) {
    register_inner(klass, klass.name.toLowerCase());
}

function register_inner(klass: typeof MyCreep, name: string) {
    if (myroles.has(name)) {
        debug.log("Double Registry!!!", name);
        return;
    }
    myroles.set(name, klass);
}

interface HasPos {
    pos: RoomPosition
}

const rewalker = defaultRewalker();

export class MyCreep extends CreepRepair {
    priority = 0;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return [null, []];
    }

    // Spawn helpers (job.role.ts): body from the spawnold table, keyed by role name.
    localSpawn(spawns: StructureSpawn[], eggMem: any) {
        return this.stratSpawn(spawns, "local", eggMem);
    }

    closeSpawn(spawns: StructureSpawn[], eggMem: any) {
        return this.stratSpawn(spawns, "close", eggMem);
    }

    private stratSpawn(spawns: StructureSpawn[], spawnStrat: string, eggMem: any) {
        const stratEggMem = _.defaults({}, eggMem, { spawn: spawnStrat, body: this.role });
        const possibleSpawns = findSpawns(spawns, this.mission!.roomName, stratEggMem) as StructureSpawn[];
        const maxRCL = Math.max(...possibleSpawns.map(s => s.room.controller!.level));
        return buildBody(possibleSpawns, stratEggMem, { maxRCL }) as [StructureSpawn | null, BodyPartConstant[]];
    }

    eggRun() { }

    // Lifecycle. Default behaviour runs the legacy roleXxx()/afterXxx() on this
    // wrapper; converted roles override start() and after().
    init(): boolean { return true; }

    start(): Task2Ret {
        this.legacyRun();
        return "wait";
    }

    after() {
        this.legacyAfter();
    }

    run(): boolean {
        if (!this.alive) {
            return false;
        }
        // Still in the spawn: the mission's hatch list owns this phase (hatchRun()).
        if (this.hatching) {
            return true;
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

    // Mission bookkeeping on retirement; TCreep.retire then deletes the memory.
    retire() {
        const mission = this.mission;
        if (mission) {
            _.remove(mission.memory.eggs, n => n === this.name);
            _.remove(mission.memory.hatch, n => n === this.name);
            _.remove(mission.memory.creeps, n => n === this.name);
        }
        super.retire();
    }

    // Task2-protocol movement (job.creep.ts), renamed walk* so the legacy move*
    // names on CreepMove stay untouched.
    walkRoom(roomName: string = "", xy = 2525, range = 20): Task2Ret {
        return this.walkPos(fromXY(xy, roomName || this.mission!.roomName), range);
    }

    walkTargetRoom(target: HasPos | null): Task2Ret {
        if (!target) return "start";
        const x = this.pos.x;
        const y = this.pos.y;
        if (target.pos.roomName === this.pos.roomName) {
            if (x === 0) {
                this.walkDir(RIGHT);
            } else if (x === 49) {
                this.walkDir(LEFT);
            } else if (y === 0) {
                this.walkDir(BOTTOM);
            } else if (y === 49) {
                this.walkDir(TOP);
            }
            this.dlog('walkRoom done');
            return "start";
        }

        const ox = target.pos.x;
        const oy = target.pos.y;
        const range = Math.max(1, Math.min(ox, oy, 49 - ox, 49 - oy) - 1);
        return this.walkTarget(target, range);
    }

    walkDir(dir: DirectionConstant): Task2Ret {
        const ret = this.move(dir);
        if (ret === ERR_BUSY || ret === ERR_TIRED) {
            return "wait";
        }
        if (ret === OK) {
            return "wait";
        }
        return "start";
    }

    walkTarget(obj: HasPos, range: number): Task2Ret {
        return this.walkPos(obj.pos, range);
    }

    walkPos(pos: RoomPosition, range: number): Task2Ret {
        const ret = rewalker.walkTo(this.c, pos, range);
        if (ret === OK) return "start";
        return "wait";
    }

    walkRange(target: HasPos) {
        return rewalker.walkTo(this.c, target.pos, 3);
    }
}

// Legacy JS mixins, merged onto the wrapper prototype in the order main.js merges
// them onto Creep.prototype today (a later file wins a name collision).
export const legacyMods = [
    'creep.attack',
    'creep.dismantle',
    'creep.heal',
    'creep.oldrepair',
    'creep.work',

    'role.archer',
    'role.bootstrap',
    'role.bulldozer',
    'role.caboose',
    'role.cart',
    'role.chemist',
    'role.claimer',
    'role.cleaner',
    'role.collector',
    'role.coresrc',
    'role.ctrl',
    'role.declaimer',
    'role.defender',
    'role.drain',
    'role.dropper',
    'role.farmer',
    'role.guard',
    'role.harvester',
    'role.hauler',
    'role.manual',
    'role.medic',
    'role.minecart',
    'role.miner',
    'role.paver',
    'role.power',
    'role.ram',
    'role.rambo',
    'role.reboot',
    'role.reserver',
    'role.scout',
    'role.srcer',
    'role.stomper',
    'role.trucker',
    'role.upgrader',
    'role.wolf',
    'role.worker',
    'role.zombiefarmer',
];

for (const mod of legacyMods) {
    lib.merge(MyCreep, require(mod));
}

// Members supplied by those JS files and used from TypeScript
// (was: `interface Creep { ... }` in src/types.d.ts).
export interface MyCreep {
    idleEmergencyUpgrade(): TaskRet
    idleUpgrade(): TaskRet
    goUpgradeController(controller: StructureController | undefined, move?: boolean): TaskRet
    taskHarvestSpots(): TaskRet
    taskRechargeHarvest(): TaskRet
}
