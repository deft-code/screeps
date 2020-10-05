import { merge, isHighway } from "lib";
import * as debug from "debug";
import { Tasker, Targetable, TaskMemory, TaskRet, MemoryTask, dynamicRole } from 'Tasker';
import { defaultRewalker, Goal, WalkReturnCode, cleanGoal } from "Rewalker";

const rewalker = defaultRewalker();

interface PowerCreep {
    memory: TaskMemory
}

const powerTasker = new Tasker();

const nowander = ['TuN9aN0', 'smokeman'];
function isOmnomwombatTerritory(roomName: string): boolean {
    let parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName);
    if (!parsed) return false;
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

function shouldIgnore(ctrlr: StructureController): boolean {
    const name = (ctrlr.sign && ctrlr.sign.username) ||
        (ctrlr.owner && ctrlr.owner.username) ||
        (ctrlr.reservation && ctrlr.reservation.username);
    return name && _.contains(nowander, name) || isOmnomwombatTerritory(ctrlr.pos.roomName);
}

declare global {
    interface PowerCreepMemory {
        enableFailed?: string[]
        task?: MemoryTask
    }
}

class PowerCreepExtra extends PowerCreep {
    toString() {
        if (this.pos) {
            return `<a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.name}</a>`
        }
        return `[PowerCreep ${this.name}]`
    }

    get role() { return this.name }
    get hurts() { return this.hitsMax - this.hits }

    idleMoveOn(pos: RoomPosition): TaskRet {
        return this.idleMoveGoal({ pos, range: 0 });
    }

    moveNear(pos: RoomPosition): ScreepsReturnCode {
        const ret = rewalker.walkTo(this, pos, 1);
        if (ret > 0) return OK;
        return ret as ScreepsReturnCode;
    }

    moveRange(pos: RoomPosition): ScreepsReturnCode {
        const ret = rewalker.walkTo(this, pos, 3);
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

    idleMoveGoal(goal: Goal): TaskRet {
        const ret = rewalker.walkTo(this, goal.pos, goal.range);
        if (ret > 0) return "walking"
        if (ret === 0) return false;
        this.errlog(ret as -1, "maybe error?");
        return false;
    }

    idleMoveRoom(roomName: string): TaskRet {
        return this.idleMoveGoal({ pos: new RoomPosition(25, 25, roomName), range: 24 });
    }

    idleMoveWaypoints(flagName: string): TaskRet {
        for (let i = 1; i < 10; i++) {
            const ret = this.idleMoveWaypoint(flagName + i);
            if (ret) {
                this.say("waypoint" + i);
                return ret;
            }

        }
        return false;
    }

    idleMoveWaypoint(flagName: string): TaskRet {
        const f = Game.flags[flagName];
        if (!f) return false;

        const ret = this.idleMoveFlag(f.name);
        if (!ret) f.remove();
        return ret;
    }

    idleMoveFlag(flagName: string): TaskRet {
        const f = Game.flags[flagName];
        if (!f) return false;
        switch (f.secondaryColor) {
            case COLOR_RED: return this.idleMoveOn(f.pos);
        }
        return this.idleMoveRoom(f.pos.roomName);
    }

    moveRoomFlag(flagName: string): WalkReturnCode {
        const f = Game.flags[flagName];
        if (!f) return ERR_INVALID_TARGET;
        return this.moveRoom(f.pos.roomName);
    }

    taskMoveRoom(name: string): TaskRet {
        if (this.pos.roomName === name) return 'done';
        this.taskNull(name);
        const ret = rewalker.walkTo(this, new RoomPosition(25, 25, name), 24);
        this.dlog("rewalk", ret);
        if (ret >= OK) {
            return "walking" + ret;
        }
        this.log("walktTo Error:", debug.errStr(ret as ScreepsReturnCode), this.pos, JSON.stringify(this.memory));
        return false;
    }

    task<T extends Targetable>(target: T | string | null | undefined, ...args: (string | number)[]): T | null {
        return powerTasker.task(this, 4, target, ...args);
    }

    taskNull(...args: (string | number)[]) {
        return powerTasker.taskNull(this, 4, ...args);
    }

    run() {
        if (!this.room) return;
        powerTasker.looper(this);
    }

    after() {
        if (!this.room) return;
        dynamicRole(this, 'after');
    }

    spawnRoom(roomName: string) {
        const room = Game.rooms[roomName];
        if (!room) return ERR_INVALID_ARGS;
        return this.spawn(_.first(room.findStructs(STRUCTURE_POWER_SPAWN)) as StructurePowerSpawn);
    }

    roleHarleyQuinn(): TaskRet {
        if (!this.ticksToLive || !this.room) return false;
        const ret = this.taskMaybeRenew() ||
            this.taskEnableCtrlr(this.room.controller) ||
            this.idleMoveWaypoints('waypoint_' + this.name) ||
            this.idleMoveFlag(this.name);
        if (ret) return ret;

        if (!this.room.controller || !this.room.controller.owner || this.room.controller.owner.username !== 'Disconnect') {
            this.say("I'm Bored!");
            return false;
        }

        //if(Game.time) return this.taskDrainStructs(this.room.findStructs(STRUCTURE_EXTENSION));
        return this.taskDrainStructs(this.room.findStructs(STRUCTURE_TOWER) as unknown as StructureExtension[]) ||
            this.taskDrainStructs(
                _.filter(this.room.findStructs(STRUCTURE_EXTENSION),
                    e => e.store.energy === e.store.getCapacity(RESOURCE_ENERGY))) ||
            this.taskDrainStructs(this.room.findStructs(STRUCTURE_EXTENSION, STRUCTURE_TOWER) as StructureExtension[]);
    }

    afterHarleyQuinn() {
        // const ob = _.first(Game.rooms.W29N11.findStructs(STRUCTURE_OBSERVER));
        // ob.observeRoom("W48N6");
        //this.idleGenerateOps();
        this.setupScrounge();
        this.idleDrip();
        this.idleDrain();
    }

    setupScrounge() {
        if (this.ticksToLive! > 1500) return false;
        if (Game.flags['waypoint_HarleyQuinn8']) return false;
        const ob = _.first(Game.rooms.W29N11.findStructs(STRUCTURE_OBSERVER));
        if (!Game.flags['waypoint_HarleyQuinn7']) {
            const room = Game.rooms['W49N10'];
            if (!room) {
                ob.observeRoom("W49N10");
                return;
            }
            room.createFlag(25, 25, 'waypoint_HarleyQuinn7');
            return;
        }
        const room = Game.rooms['W41N10'];
        if (!room) {
            ob.observeRoom("W41N10");
            return;
        }
        room.createFlag(25, 25, 'waypoint_HarleyQuinn8');
        return;
    }

    roleHeimdall(): TaskRet {
        if (Game.shard.name !== 'shard1') return false;
        if (!this.ticksToLive && !this.spawnCooldownTime) {
            this.spawnRoom("W29N11");
        }
        if (this.shard !== Game.shard.name) return false;

        const ob = _.first(Game.rooms.W29N11.findStructs(STRUCTURE_OBSERVER));
        if (!ob) return false;

        return this.taskHomeRenew() || this.taskOperateObserver(ob) || this.taskMoveNear(ob);
    }

    afterHeimdall() {
        this.idleGenerateOps();
    }


    roleGenesis(): TaskRet {
        if (!this.ticksToLive || !this.room) {
            const err = this.spawnRoom('W23N15')
            if (err !== OK) {
                this.dlog("Homeless :(", debug.errStr(err));
                return false;
            }
            return "spawned"
        }

        let ret = this.taskHomeRenew();
        if (ret) return ret;

        ret = this.taskMoveRoom('W21N15');
        if (ret && ret !== 'done') {
            this.log(this.pos, "to room", ret);
            return ret;
        }

        const room = Game.rooms.W21N15;
        if (!room) return false;

        return this.taskRegenSources(room);
    }

    preMagellan(): boolean {
        // Not spawned stop tasks.
        return !!this.room
    }

    roleMagellan(): TaskRet {
        if (!this.ticksToLive || !this.room) {
            const r = _.find(_.shuffle(Game.rooms), r => r.controller && r.controller.my && r.controller.level === 8 && r.findStructs(STRUCTURE_POWER_SPAWN).length > 0);
            if (!r) {
                this.log("No homes!");
                return "homeless";
            }
            const err = this.spawnRoom('W29N11')
            if (err !== OK) {
                this.dlog("Homeless :(", debug.errStr(err));
                return false;
            }
            return "spawned"
        }

        //this.log("restarted", JSON.stringify(this.memory));

        let ret = this.taskEnableCtrlr(this.room.controller);
        if (ret) return ret;

        ret = this.taskMaybeRenew();
        if (ret) return ret;

        const others = _.values(Game.map.describeExits(this.pos.roomName)) as string[];
        const next = _.sample(others);
        this.log("next rooms", others, "next room", next);
        return this.taskMoveRoom(next);
    }

    idleGenerateOps() {
        if (this.tick.power) return false;

        const p = this.powers[PWR_GENERATE_OPS];
        if (!p) return false;

        const cd = p.cooldown || 0;
        if (cd) return false;

        if (!this.store.getFreeCapacity()) return false;

        const ret = this.usePower(PWR_GENERATE_OPS);
        this.errlog(ret, "gen ops failed!");

        this.say("moar ops", true);
        this.log("generated OPS!");
        return true;
    }

    idleDrip(): TaskRet {
        if (!this.store.energy || this.tick.drop) return false;
        const ret = this.drop(RESOURCE_ENERGY, Math.ceil(this.store.energy / 2));
        if (ret === OK) return "done";
        this.errlog(ret, "failed to drip");
        return false;
    }

    idleDrain(): TaskRet {
        if (!this.room) return false;
        if (this.tick.withdraw) return false;
        if (!this.store.getFreeCapacity()) return false;
        const looks = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);
        for (const look of looks) {
            const s = look[LOOK_STRUCTURES] as StructureExtension;
            if (s.store && s.store.energy) {
                const ret = this.withdraw(s, RESOURCE_ENERGY);
                if (ret === OK) return "done";
                this.errlog(ret, "unexpected error");
            }
        }
        return false;
    }

    taskDrainStructs(structs: StructureExtension[]) {
        const full = _.filter(structs, e => e.store.energy === e.store.getCapacity(RESOURCE_ENERGY));
        if (full.length) {
            const i = rewalker.planWalk(this, _.map(full, e => { return { pos: e.pos, range: 1 } }));
            if (i >= 0) {
                return this.taskDrainStruct(full[i]);
            }
        }
        const partial = _.filter(structs, e => e.store.energy);
        if (partial.length) {
            const i = rewalker.planWalk(this, _.map(partial, e => { return { pos: e.pos, range: 1 } }));
            if (i >= 0) {
                return this.taskDrainStruct(partial[i]);
            }
        }
        return false;
    }

    taskDrainStruct(extn: StructureExtension | null): TaskRet {
        extn = this.task(extn);
        if (!extn) return false;
        if (this.store.getFreeCapacity() < extn.store.energy) {
            this.log("emergency drop");
            this.drop(RESOURCE_ENERGY, this.store.energy);
            this.tick.drop = RESOURCE_ENERGY;
        }
        const ret = this.withdraw(extn, RESOURCE_ENERGY);
        switch (ret) {
            case OK:
                this.tick.withdraw = RESOURCE_ENERGY;
                return "done";
            case ERR_NOT_IN_RANGE:
                const ret = this.moveNear(extn.pos);
                if (ret === OK) return "moving";
                return false;
        }
        this.errlog(ret, "unknown error");
        return false;
    }


    taskRegenSources(room: Room): TaskRet {
        const p = this.powers[PWR_REGEN_SOURCE];
        if (!p) return false;
        const cd = p.cooldown || 0;

        const srcs = _.filter(
            room.find(FIND_SOURCES),
            src => {
                const ttl = src.regenTTL;
                const d = this.pos.getRangeTo(src);
                return ttl < d && cd <= ttl;
            });
        if (!srcs.length) return false;

        const i = rewalker.planWalk(this, srcs.map(s => { return { pos: s.pos, range: 3 } }));
        if (i < 0) {
            this.log(debug.errStr(i as ScreepsReturnCode))
            return false;
        }
        return this.taskRegenSource(srcs[i as 0]);
    }

    taskRegenSource(src: Source | null): TaskRet {
        src = this.task(src);
        if (!src) return false;

        const p = this.powers[PWR_REGEN_SOURCE];
        if (!p) return false;
        const cd = p.cooldown || 0;

        const ttl = src.effectTTL(PWR_REGEN_SOURCE);
        const d = this.pos.getRangeTo(src);
        if (ttl > d || cd > d) return false;

        if (this.tick.power) return "wait";
        const ret = this.usePower(PWR_REGEN_SOURCE, src);
        switch (ret) {
            case OK:
                src.tick.regen = true;
                this.tick.power = PWR_REGEN_SOURCE;
                return "done";
            case ERR_NOT_IN_RANGE:
                const ret = this.moveRange(src.pos);
                if (ret === OK) return "moving";
                return false;
        }
        this.errlog(ret, "unknown error")
        return false;
    }

    taskOperateObserver(ob: StructureObserver | null): TaskRet {
        ob = this.task(ob);
        if (!ob) return false;

        const p = this.powers[PWR_OPERATE_OBSERVER];
        if (!p) return false;
        const cd = p.cooldown || 0;

        const dist = this.pos.getRangeTo(ob.pos);
        if (cd - dist > 3) return false;

        const ttl = ob.effectTTL(PWR_OPERATE_OBSERVER);
        if (ttl > dist) return false;

        if (this.tick.power) return "wait";
        const ret = this.usePower(PWR_OPERATE_OBSERVER, ob);
        switch (ret) {
            case OK:
                this.tick.power = PWR_OPERATE_OBSERVER;
                return "done";
            case ERR_NOT_ENOUGH_ENERGY:
                this.log("too poor :(");
                return false;
            case ERR_NOT_IN_RANGE:
                const ret = this.moveRange(ob.pos);
                if (ret === OK) return "moving";
                return false;
        }
        this.errlog(ret, "unknown error");
        return false;
    }

    taskHomeRenew(): TaskRet {
        if (this.ticksToLive! > 1500) return false;

        const pss = _.map(
            _.filter(Game.rooms,
                r => r.controller && r.controller.my && r.controller.level === 8 && r.findStructs(STRUCTURE_POWER_SPAWN).length > 0),
            r => r.findStructs(STRUCTURE_POWER_SPAWN)[0] as StructurePowerSpawn);
        const goals = _.map(pss,
            ps => {
                return {
                    pos: ps.pos,
                    range: 1,
                }
            });
        const i = rewalker.planWalk(this, goals);
        if (i < 0) {
            this.log("bad plan", debug.errStr(i as -1));
            return false;
        }
        return this.taskRenew(pss[i]);
    }

    taskMaybeRenew(roomName?: string): TaskRet {
        if (this.ticksToLive! > 4900) return false;
        let room = this.room!;
        if (roomName) room = Game.rooms[roomName];
        const ps = _.first(room.findStructs(STRUCTURE_POWER_SPAWN) as StructurePowerSpawn[]);
        if (ps && ps.my) {
            return this.taskRenew(ps);
        }
        return this.taskRenew(_.first(room.findStructs(STRUCTURE_POWER_BANK) as StructurePowerBank[]));
    }

    taskRenew(ps: StructurePowerSpawn | StructurePowerBank | null): TaskRet {
        if (this.ticksToLive! > 4900) return false;
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
        if (shouldIgnore(ctrlr)) {
            ef.push(ctrlr.pos.roomName);
            this.log("Ignoring new room", ctrlr.pos.roomName);
            return true;
        }
        return false;
    }

    taskEnableCtrlr(ctrlr?: StructureController | null, until?: number): TaskRet {
        //this.log("until", until, until! - Game.time);
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
        if (this.ignorePower(ctrlr)) return false;
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

    taskPingPong(ping: Flag | null, pong: Flag | null): TaskRet {
        return this.taskPing(ping) || this.taskPing(pong) || "again";
    }

    taskPing(ping: Flag | null): TaskRet {
        if (!ping) return false;

        if (this.pos.isNearTo(ping)) return false;

        return this.taskMoveNear(ping);
    }

    taskMoveNear(obj: (Targetable & { pos: RoomPosition }) | string | null): TaskRet {
        obj = this.task(obj);
        if (!obj) {
            return false
        }

        const ret = rewalker.walkTo(this, obj.pos, 1);
        if (ret > OK) return 'moved';
        return 'done';
    }
}

merge(PowerCreep, PowerCreepExtra);
merge(PowerCreep, debug.Debuggable);

function* radar(banks: string[], origin: string) {
    let ob = _.first(Game.rooms.W29N11.findStructs(STRUCTURE_OBSERVER));
    if (!ob) return;
    const obid = ob.id;
    const rooms = roomFill(origin);
    let room = rooms.next().value;
    while (Game.map.getRoomLinearDistance(origin, room) < 20) {
        if (isHighway(room)) {
            ob = Game.getObjectById<StructureObserver>(obid)!;
            if (!ob) return;
            let ret = ob.observeRoom(room);
            if (!ret) debug.errlog(ret, "failed to observe");
            yield;



        }

    }



}

export function* roomFill(origin: string) {
    const open = [origin];
    const close = new Set<string>();
    while (open.length) {
        const roomName = open.shift()!;
        yield roomName;
        const exits = _.values(Game.map.describeExits(roomName)) as string[]
        for (const exit of exits) {
            if (_.contains(open, exit) || close.has(exit)) continue;
            open.push(exit);
        }
    }
    return "";
}