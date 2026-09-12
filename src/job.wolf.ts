import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { CreepRole } from "creep.role";

// Port of role.wolf.js (2017 flag-team era) to the 2022 mission/job system.
// A melee creep spawned in the mission's "home" room. It walks to the mission
// room, kills whatever enemy creeps it meets on the way or in the room, then
// tears down any invader core. Farm lays one through paceJobs(Wolf, 1500)
// while a core stands (the team.ts suppressInvaderCore rule).
@register
export class Wolf extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const homeName = this.homeName;
        if (!homeName) return [null, []];
        const homeSpawns = spawns.filter(s => s.room.name === homeName);
        if (!homeSpawns.length) return [null, []];
        // body key "wolf" in spawnold.buildBody: 1 MOVE per ATTACK, needs >= 700 energy available
        return this.localSpawn(homeSpawns, { spawn: homeName, body: "wolf" });
    }

    get homeName(): string | null {
        return this.mission.getRoomName("home");
    }

    // Typed view of the prototype mixins this job leans on (intents, hurts, melee, activeByType).
    get cc(): CreepRole {
        return this.c as CreepRole;
    }

    start(): Task2Ret {
        const c = this.cc;
        if (this.shouldRetreat()) return this.retreat();

        // role.wolf.js taskWolf: nearest enemy creep in the current room first,
        // then the invader core, wherever we happen to be.
        const enemy = this.pos.findClosestByRange(c.room.enemies || []);
        if (enemy) return this.attack(enemy);

        const core = _.first(c.room.findStructs(STRUCTURE_INVADER_CORE));
        if (core) return this.attack(core);

        if (c.room.name !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        // role.wolf.js movePeace(team): hold near the room center.
        return this.hold();
    }

    // role.wolf.js idleRetreat(TOUGH): a wolf has no TOUGH, so it retreated
    // whenever it had lost 100 hits. Keep fighting while more than half alive
    // and still armed.
    shouldRetreat(): boolean {
        const c = this.cc;
        if (!c.melee) return true;
        return c.hurts >= 100 && c.hurts > c.hits;
    }

    @task
    retreat(): Task2Ret {
        const c = this.cc;
        if (c.melee && c.hurts < 100) return "start";
        const homeName = this.homeName;
        if (!homeName) return "wait";
        const ctrl = Game.rooms[homeName]?.controller;
        if (ctrl) {
            this.moveTarget(ctrl, 3);
        } else {
            this.moveRoom(homeName);
        }
        return "wait";
    }

    @task
    attack(target: Creep | AnyStructure): Task2Ret {
        const c = this.cc;
        if (target.pos.roomName !== this.pos.roomName) return "start";
        // Enemy creeps outrank a core; drop the structure to retarget.
        if (!(target instanceof Creep) && (c.room.enemies || []).length) return "start";

        const err = c.attack(target);
        if (err === OK) {
            c.intents.melee = target;
            // Step into the target's square so a fleeing creep stays in reach.
            if (target instanceof Creep) this.moveDir(this.pos.getDirectionTo(target));
            return "wait";
        }
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(target, 1);
            return "wait";
        }
        this.log("attack failed", err, target);
        return "start";
    }

    hold(): Task2Ret {
        const center = new RoomPosition(25, 25, this.pos.roomName);
        if (this.pos.inRangeTo(center, 3)) return "wait";
        this.movePos(center, 3);
        return "wait";
    }

    // role.wolf.js afterWolf: opportunistic melee on an adjacent enemy, and
    // self-heal if any HEAL part is left, once the main intent is spent.
    after() {
        if (!this.c) return;
        const c = this.cc;
        if (!c.intents.melee) {
            const enemy = this.pos.findClosestByRange(c.room.enemies || []);
            if (enemy && this.pos.isNearTo(enemy) && c.attack(enemy) === OK) {
                c.intents.melee = enemy;
            }
        }
        if (!c.intents.melee && c.hurts && c.activeByType.get(HEAL)) {
            if (c.heal(c) === OK) c.intents.melee = c;
        }
    }
}
