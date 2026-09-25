import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { CreepRole } from "creep.role";

// Port of role.wolf.js (2017 flag-team era) to the 2022 mission/job system.
// A melee creep spawned in the mission's "home" room. It walks to the mission
// room, kills whatever enemy creeps it meets on the way or in the room, then
// tears down any invader core. Farm and Remote lay one through
// paceJobs(Wolf, 1500) while a core stands (team.ts suppressInvaderCore) and
// through paceJobs(Wolf, max(1500 - thostiles, 350)) once armed hostiles have
// camped the room for 300 ticks (team.ts suppressWolf).
@register
export class Wolf extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // body key "wolf" in spawnold.buildBody: a close spawn whose room capacity
        // is >= 700, body scaled by energyDef to the energy available there now:
        // n ATTACK + n MOVE (130 per level), at least level 4 (520: sized to max(550, energy
        // available), so a drained room waits) up to level 25 (3250, 50 parts).
        // See docs/spawning.md "Body definitions". Offroad creep: spawns fine from
        // whatever spawns are nearest the mission room.
        return this.closeSpawn(spawns, { body: "wolf" });
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

        // Armed hostiles first, then the invader core, then any other enemy
        // creep (scouts, haulers), wherever we happen to be. Never Source
        // Keepers: they stay by their lair, Rewalker paths around them, and a
        // wolf that engages one on the way through an SK room never leaves it.
        const hostile = this.pos.findClosestByRange(this.hostiles);
        if (hostile) return this.attack(hostile);

        const core = _.first(c.room.findStructs(STRUCTURE_INVADER_CORE));
        if (core) return this.attack(core);

        const enemy = this.pos.findClosestByRange(this.enemies);
        if (enemy) return this.attack(enemy);

        if (c.room.name !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        // role.wolf.js movePeace(team): hold near the room center.
        return this.hold();
    }

    // Enemy creeps worth a fight in the current room, Source Keepers excluded.
    get enemies(): Creep[] {
        return (this.cc.room.enemies || []).filter(e => !e.keeper);
    }

    get hostiles(): Creep[] {
        return (this.cc.room.hostiles || []).filter(e => !e.keeper);
    }

    // role.wolf.js idleRetreat(TOUGH): a wolf has no TOUGH, so it retreated
    // whenever it had lost 100 hits. Keep fighting while more than half alive
    // and still armed. A mission without a home room (Once) has nowhere to
    // retreat to, so its wolf fights to the end.
    shouldRetreat(): boolean {
        const c = this.cc;
        if (!this.homeName) return false;
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
        // Armed hostiles outrank everything else; retarget when one appears
        // while we are chewing on a core or an unarmed enemy.
        if (this.hostiles.length && !(target instanceof Creep && target.hostile)) return "start";

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
            const enemy = this.pos.findClosestByRange(this.enemies);
            if (enemy && this.pos.isNearTo(enemy) && c.attack(enemy) === OK) {
                c.intents.melee = enemy;
            }
        }
        if (!c.intents.melee && c.hurts && c.activeByType.get(HEAL)) {
            if (c.heal(c) === OK) c.intents.melee = c;
        }
    }
}
