import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { CreepMove } from "creep.move";
import { roomCentroid } from "spots";

// Port of role.guard.js (2017 flag-team era) to the 2022 mission/job system.
// A ranged skirmisher with a heal part, spawned in the mission's "home" room.
// It walks to the mission room and picks a fight by the number of melee
// enemies there: none, hunt anything with ranged fire; one, duel it by
// kiting; more, kite the closest one. With no enemies it heals hurt friendlies
// and holds near the room centre. Farm and Remote lay one through
// paceJobs(Guard, max(1500 - thostiles, 350)) once armed hostiles have been
// seen for 100 consecutive ticks (team.ts suppressGuard was 3).

// role.guard.js idleRetreat(TOUGH, RANGED_ATTACK): go home once this many
// hits are lost, unless more than half alive with one of those parts active.
const kRetreatHurts = 100;
// idleFlee range when kiting a melee enemy.
const kKiteRange = 5;
// hold(): ticks with nothing to do before drifting to the room centroid. A
// friendly flickering across an exit (in view one tick, gone the next) keeps
// resetting the count, so the guard stays put and nudges toward it instead of
// pacing back to the middle every other tick.
const kHoldIdle = 3;
const kHoldRange = 3;
// engage(): close to this range on a target. Melee targets are kept at 3
// because kite() backs off at 2, and closing to 2 would fight it.
const kEngageRange = 2;
const kEngageMeleeRange = 3;

declare global {
    interface CreepMemory {
        // Guard.hold(): consecutive ticks spent holding.
        gidle?: number
    }
}

@register
export class Guard extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // body key "guard" in spawnold.buildBody. energySpawn picks the first
        // close spawn whose room *capacity* is >= 550; energyDef then scales the
        // body to that room's energy *available* right now (docs/spawning.md):
        //   base [MOVE, HEAL] (300) + per level [TOUGH, RANGED_ATTACK] + 2 MOVE (260)
        //   level 1:  T 3M RA H             6 parts,  560 energy (the floor)
        //   level 2:  2T 5M 2RA H          10 parts,  820
        //   level n:  nT (2n+1)M nRA H      300 + 260n, up to
        //   level 12: 12T 25M 12RA H       50 parts, 3420 (the part cap)
        // Sorted TOUGH first, then every MOVE (movesFirst), RANGED_ATTACK, HEAL
        // last: damage costs speed only once the weapons are already gone.
        return this.remoteSpawn(spawns, { body: "guard" });
    }

    get homeName(): string | null {
        return this.mission.getRoomName("home");
    }

    // Typed view of the prototype mixins this job leans on (intents, hurts,
    // activeByType, partsByType, idleFlee).
    get cc(): CreepMove {
        return this.c as CreepMove;
    }

    // Whether decide() ended in hold() this tick; anything else resets gidle.
    holding = false;

    start(): Task2Ret {
        this.holding = false;
        const ret = this.decide();
        if (!this.holding) delete this.memory.gidle;
        return ret;
    }

    decide(): Task2Ret {
        const c = this.cc;
        if (this.shouldRetreat()) return this.retreat();

        if (c.room.name !== this.mission.roomName) {
            // Fight whatever is in the way rather than walking through it,
            // except Source Keepers: they stay by their lair, and engaging one
            // from range 3 parks the guard there for good.
            const enemy = this.pos.findClosestByRange((c.room.enemies || []).filter(e => !e.keeper));
            if (enemy && this.pos.inRangeTo(enemy, 3)) return this.engage(enemy);
            return this.moveRoom(this.mission.roomName);
        }

        // role.guard.js taskGuard: pick the fight by melee count.
        const melees = c.room.melees || [];
        if (melees.length > 1) {
            const melee = this.pos.findClosestByRange(melees);
            if (melee) return this.kite(melee);
        }
        if (melees.length === 1) return this.duel(melees[0]);
        const enemy = this.pos.findClosestByRange(c.room.enemies || []);
        if (enemy) return this.hunt(enemy);

        // role.guard.js taskGuardHealRoom: patch up a hurt friendly.
        const hurt = _.sample(c.room.find(FIND_MY_CREEPS).filter(f => f.hits < f.hitsMax));
        if (hurt) return this.healCreep(hurt);

        // role.guard.js movePeace(team): hold near the room centre.
        return this.hold();
    }

    shouldRetreat(): boolean {
        const c = this.cc;
        if (c.hurts < kRetreatHurts) return false;
        if (c.hits > c.hurts) {
            for (const part of [TOUGH, RANGED_ATTACK] as BodyPartConstant[]) {
                if (!c.partsByType.get(part)) continue;
                if (c.activeByType.get(part)) return false;
            }
        }
        return true;
    }

    @task
    retreat(): Task2Ret {
        // Back to work once healed below the threshold (it self-heals on the way).
        if (this.cc.hurts < kRetreatHurts) return "start";
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

    // role.guard.js taskHunt: chase an enemy while no melee is in the room.
    @task
    hunt(target: Creep): Task2Ret {
        const c = this.cc;
        if (target.pos.roomName !== this.pos.roomName) return "start";
        if ((c.room.melees || []).length) return "start";
        this.engage(target);
        return "wait";
    }

    // role.guard.js taskDuel: kite a lone melee; drop it once a second melee
    // shows up, or if the target lost its ATTACK parts while others remain.
    @task
    duel(target: Creep): Task2Ret {
        const c = this.cc;
        if (target.pos.roomName !== this.pos.roomName) return "start";
        const nmelees = (c.room.melees || []).length;
        if (nmelees > 1) return "start";
        if (!target.melee && nmelees) return "start";
        return this.kite(target);
    }

    // role.guard.js goKite: shoot, and back off from every melee when one is
    // within two tiles; otherwise close to range 3.
    kite(target: Creep): Task2Ret {
        const c = this.cc;
        const range = this.pos.getRangeTo(target);
        if (range <= 2) {
            this.shoot(target, range);
            c.idleFlee(c.room.melees || [], kKiteRange);
            return "wait";
        }
        return this.engage(target);
    }

    // Shoot the target and close to kEngageRange (a melee target: 3, see
    // kite); every tick both, so it keeps closing while it fires.
    engage(target: Creep): Task2Ret {
        const range = this.pos.getRangeTo(target);
        const hold = target.melee ? kEngageMeleeRange : kEngageRange;
        if (range <= 3) this.shoot(target, range);
        if (range > hold) this.moveTarget(target, hold);
        return "wait";
    }

    // Mass attack when adjacent, ranged attack otherwise; one ranged intent per tick.
    shoot(target: Creep, range: number): boolean {
        const c = this.cc;
        if (c.intents.range) return false;
        const err = range <= 1 ? c.rangedMassAttack() : c.rangedAttack(target);
        if (err !== OK) return false;
        c.intents.range = range <= 1 ? "mass attack" : target;
        return true;
    }

    // role.guard.js taskGuardHeal: only while no melee is in the room.
    @task
    healCreep(target: Creep): Task2Ret {
        const c = this.cc;
        if (target.pos.roomName !== this.pos.roomName) return "start";
        if ((c.room.melees || []).length) return "start";
        if (target.hits >= target.hitsMax) return "start";
        if (!this.pos.isNearTo(target)) {
            this.moveTarget(target, 1);
            return "wait";
        }
        if (c.heal(target) === OK) c.intents.melee = target;
        return "wait";
    }

    // Nothing to do: after kHoldIdle idle ticks, drift to within range of the
    // room centroid (spots.roomCentroid).
    hold(range = kHoldRange): Task2Ret {
        this.holding = true;
        const idle = (this.memory.gidle || 0) + 1;
        this.memory.gidle = idle;
        if (idle < kHoldIdle) return "wait";
        const center = roomCentroid(this.pos.roomName);
        if (this.pos.inRangeTo(center, range)) return "wait";
        this.movePos(center, range);
        return "wait";
    }

    // role.guard.js afterGuard: opportunistic ranged fire, then idleHeal
    // (self, then an adjacent friendly, then a ranged heal within 3, then
    // overheal under fire).
    after() {
        if (!this.c) return;
        const c = this.cc;
        if (!c.intents.range) {
            const enemy = this.pos.findClosestByRange(c.room.enemies || []);
            if (enemy) this.shoot(enemy, this.pos.getRangeTo(enemy));
        }
        if (c.intents.melee || !c.activeByType.get(HEAL)) return;
        if (c.hurts) {
            if (c.heal(c) === OK) c.intents.melee = c;
            return;
        }
        const near = c.room.lookForAtRange(LOOK_CREEPS, this.pos, 3, true)
            .map(spot => spot[LOOK_CREEPS] as Creep)
            .filter(f => f.my && f.hits < f.hitsMax);
        const adjacent = near.find(f => this.pos.isNearTo(f));
        if (adjacent) {
            if (c.heal(adjacent) === OK) c.intents.melee = adjacent;
            return;
        }
        const far = _.first(near);
        if (far && !c.intents.range) {
            if (c.rangedHeal(far) === OK) c.intents.melee = c.intents.range = far;
            return;
        }
        if ((c.room.hostiles || []).length && c.heal(c) === OK) c.intents.melee = c;
    }
}
