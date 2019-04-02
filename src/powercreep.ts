import { merge } from "lib";
import * as debug from "debug";
import { Tasker, Targetable, TaskMemory, TaskRet } from 'Tasker';
import { defaultRewalker, Goal, WalkReturnCode, cleanGoal } from "Rewalker";

const rewalker = defaultRewalker();

interface PowerCreep {
    memory: TaskMemory
}

const powerTasker = new Tasker();

const nowander = ['TuN9aN0', 'smokeman'];
function isOmnomwombatTerritory(roomName: string): boolean {
    let parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName);
    if(!parsed) return false;
    let xDir = parsed[1];
    let xNum = parseInt(parsed[2], 10);
    let yDir = parsed[3];
    let yNum = parseInt(parsed[4], 10);

    return (xDir == 'W'
        && yDir == 'N'
        && xNum > 20
        && xNum < 40
        && yNum > 0
        && yNum < 10);
}


class PowerCreepExtra extends PowerCreep {
    get role() { return this.name }
    get hurts() { return this.hitsMax - this.hits }

    get carryTotal() { return _.sum(this.carry) }

    get carryFree() { return this.carryCapacity - this.carryTotal }

    moveNear(pos: RoomPosition): ScreepsReturnCode {
        const ret = rewalker.walkTo(this, pos, 1);
        if (ret > 0) return OK;
        return ret as ScreepsReturnCode;
    }

    moveGoal(goal: Goal): WalkReturnCode {
        return rewalker.walkTo(this, goal.pos, goal.range);
    }

    moveRoom(roomName: string): WalkReturnCode {
        const goal = cleanGoal({ pos: new RoomPosition(25, 25, roomName), range: 24 });
        return this.moveGoal(goal);
    }

    taskMoveRoom(name: string): TaskRet {
        if (this.pos.roomName === name) return 'done';
        this.taskNull(name);
        const ret = rewalker.walkTo(this, new RoomPosition(25, 25, name), 24);
        if (ret >= OK) {
            return "walking"
        }
        this.log("walktTo Error:", debug.errStr(ret as ScreepsReturnCode));
        return false;
    }

    task<T extends Targetable>(target: T | string | null | undefined, ...args: (string | number)[]): T | null {
        return powerTasker.task(this, 4, target, ...args);
    }

    taskNull(...args: (string | number)[]) {
        return powerTasker.taskNull(this, 4, ...args);
    }

    run() {
        powerTasker.looper(this);
    }

    spawnRoom(roomName: string): ERR_INVALID_ARGS | ERR_INVALID_TARGET | OK {
        const room = Game.rooms[roomName];
        if (!room) return ERR_INVALID_ARGS;
        return this.spawn(_.first(room.findStructs(STRUCTURE_POWER_SPAWN)) as StructurePowerSpawn);
    }

    preMagellan(): boolean {
        // Not spawned stop tasks.
        return !!this.room
    }

    roleMagellan(): TaskRet {
        if (!this.ticksToLive || !this.room) {
            const r = _.find(_.shuffle(Game.rooms), r => r.controller && r.controller.my && r.controller.level === 8 && r.findStructs(STRUCTURE_POWER_SPAWN).length > 0);
            if( !r ) {
                this.log ("No homes!");
                return "homeless";
            }
            const err = this.spawnRoom('W29N11')
            if (err !== OK) {
                this.dlog("Homeless :(", debug.errStr(err));
                return false;
            }
            return "spawned"
        }

        this.log("restarted", JSON.stringify(this.memory));

        let ret = this.taskEnableCtrlr(this.room.controller);
        if (ret) return ret;

        ret = this.taskMaybeRenew();
        if (ret) return ret;

        const others = _.values(Game.map.describeExits(this.pos.roomName)) as string[];
        const next = _.sample(others);
        this.log("next rooms", others, "next room", next);
        return this.taskMoveRoom(next);
    }

    taskMaybeRenew(name?: string): TaskRet {
        if (this.ticksToLive > 4500) return false;
        let room = this.room;
        if (name) room = Game.rooms[name];
        const ps = _.first(room.findStructs(STRUCTURE_POWER_SPAWN) as StructurePowerSpawn[]);
        if (ps && ps.my) {
            return this.taskRenew(ps);
        }
        return this.taskRenew(_.first(room.findStructs(STRUCTURE_POWER_BANK) as StructurePowerBank[]));
    }

    taskRenew(ps: StructurePowerSpawn | StructurePowerBank | null): TaskRet {
        if (this.ticksToLive > 4500) return false;
        ps = this.task(ps);
        if (!ps) return false;
        const ret = this.renew(ps);
        switch (ret) {
            case OK: return "renewed";
            case ERR_NOT_IN_RANGE:
                const ret2 = this.moveNear(ps.pos);
                if (ret2 >= OK) {
                    return "moving";
                }
                this.log("unexpected move error", debug.errStr(ret2))
                return false;
        }
        this.log("unexpected renew error", debug.errStr(ret))
        return false;
    }


    taskEnableRoom(roomName: string): TaskRet {
        this.taskNull(roomName);
        const room = Game.rooms[roomName];
        if (!room) {
            const ret = this.moveRoom(roomName);
            if (ret >= OK) return "blind";
            this.log("failed blind walk", roomName);
            return false;
        }
        return this.taskEnableCtrlr(room.controller);
    }

    ignorePower(ctrlr: StructureController | null): boolean {
        if (!ctrlr) return false;
        const ef = this.memory.enableFailed = this.memory.enableFailed || [];
        if (_.includes(ef, ctrlr.pos.roomName)) return true;
        if (ctrlr.owner && _.contains(nowander, ctrlr.owner.username)) {
            ef.push(ctrlr.pos.roomName);
            return true;
        }
        if (ctrlr.reservation && _.contains(nowander, ctrlr.reservation.username)) {
            ef.push(ctrlr.pos.roomName);
            return true;
        }
        if (isOmnomwombatTerritory(ctrlr.pos.roomName)) {
            ef.push(ctrlr.pos.roomName);
            return true;
        }
        return false;
    }

    taskEnableCtrlr(ctrlr?: StructureController | null, until?: number): TaskRet {
        this.log("until", until, until! - Game.time);
        if (!until) {
            until = Game.time + 100;
        }
        ctrlr = this.task(ctrlr, until);
        if (!ctrlr) return false;
        if (Game.time > until) {
            const ef = this.memory.enableFailed = this.memory.enableFailed || [];
            ef.push(ctrlr.pos.roomName);
            return false;
        }
        if(this.ignorePower(ctrlr)) return false;
        if (ctrlr.isPowerEnabled) return false;
        const ret = this.enableRoom(ctrlr);
        if (ret === OK) return 'done';
        if (ret === ERR_NOT_IN_RANGE) {
            const ret = this.moveNear(ctrlr.pos);
            if (ret >= OK) {
                return "moving";
            } else if (ret === ERR_NO_PATH) {
                this.log("Failed to path to controller", this.pos.roomName, ctrlr.pos.roomName);
                const ef = this.memory.enableFailed = this.memory.enableFailed || [];
                ef.push(ctrlr.pos.roomName);
                return false;
            }
            else {
                this.log("unexpected move error", debug.errStr(ret))
                return false;
            }
        }
        return "thing";
    }

    taskPing(): TaskRet {
        this.log("task name", this.taskNull());
        return false;
    }
}

merge(PowerCreep, PowerCreepExtra);
merge(PowerCreep, debug.Debuggable);
