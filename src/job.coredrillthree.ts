import { register, Task2Ret } from "mycreep";
import { Wickthree } from "job.wickthree";
import { Boost, coverHits } from "job.wicktwo";
import { healIdle, healSelf } from "heal";
import { isActiveMilitant } from "creep.enemy";
import { TStruct } from "tstruct";
import type { InvaderCoreThree } from "ms.invadercorethree";

// Coredrillthree: the InvaderCoreThree mission's fighter
// (ms.invadercorethree.ts) against a level 3 invader core: the Wickthree
// (job.wickthree.ts: 6 TOUGH, 10 MOVE, 21 RANGED_ATTACK, 13 HEAL; its
// spawn beside the labs, its boosting and its heals are used as they are)
// with every boost on, the ranged one included: 840 a shot, and three
// towers' 1800 raw is 540 through the TOUGH, under the 624 healed.
//
// Boosted (at home, Wicktwo.boost), by the state of the core:
//   standing: walk onto the mission's spot (the InvaderCore flag: within 3
//     of the core, off the keepers, not beside a rampart) and stay. The
//     core is shot from there; a shot at a structure under a rampart lands
//     on the rampart, so the core's own rampart falls first.
//   gone: decided once (memory.retire). With more than kStayTTL ticks to
//     live, home to the spawn that hatched it to be recycled. With less,
//     wreck: beside the first of the mission's listed targets, else the
//     nearest rampart (the pick kept as a TStruct), stepping one tile at a
//     time to wherever a mass attack deals as much or more
//     (Wicktwo.reposition), mass attacking all the while.
// Firing (after(), one ranged intent a tick), the ladder:
//   1. an armed enemy creep beside us, not under a rampart over
//      kRampartSkip: a mass attack (it deals a shot's damage at range 1 and
//      hits everything else besides). The drill lets itself be distracted:
//      what walks up to it should die of it.
//   2. the core, within 3.
//   3. wrecking: a mass attack while it would hit anything.
//   4. idleRanged: any enemy creep within 3 not under such a rampart, the
//      armed before the unarmed, the nearest of them.
// Healing as the wick: self every tick while the core stands and a tower
// has energy, else the idle cascade (heal.ts healIdle).
const kStayTTL = 500;
const kShotRange = 3;
// A creep under a rampart over this many hits is not shot through it.
const kRampartSkip = 10000;

declare global {
    interface CreepMemory {
        // Coredrill: the core is gone and we are going home to be recycled
        // (true) or wrecking ramparts (false); undefined while it stands.
        retire?: boolean
    }
}

@register
export class Coredrillthree extends Wickthree {
    // Wrecking: the structure we walk to and circle.
    goal: TStruct | null = null;

    get coreMission(): InvaderCoreThree {
        return this.mission as unknown as InvaderCoreThree;
    }

    // Every boost, the ranged one too.
    wantedBoosts(): Boost[] {
        return this.ctor.boosts(true);
    }

    start(): Task2Ret {
        const m = this.coreMission;
        if (!m) return "wait";
        // Before boosting: a drill that hatches after the core fell hands
        // its body back bare.
        if (m.coreDead) return this.afterCore();
        if (!this.boosted && this.pos.roomName === this.homeName) return this.boost();
        return this.drill();
    }

    // Onto the spot, and stay.
    drill(): Task2Ret {
        const spot = this.coreMission.spotPos;
        if (spot && !this.pos.isEqualTo(spot)) this.movePos(spot, 0);
        return "wait";
    }

    afterCore(): Task2Ret {
        const mem = this.memory;
        if (mem.retire === undefined) {
            mem.retire = this.ticksToLive > kStayTTL;
            this.log("core gone with", this.ticksToLive, "ticks left;", mem.retire ? "home to recycle" : "wrecking ramparts");
        }
        if (mem.retire) return this.recycleAt(this.originSpawn());
        return this.wreck();
    }

    // Beside the goal, circling it for the most mass damage.
    wreck(): Task2Ret {
        const m = this.coreMission;
        if (this.pos.roomName !== m.roomName) {
            this.moveRoom(m.roomName);
            return "wait";
        }
        const goal = this.wreckGoal();
        if (!goal) return "wait";
        if (!this.pos.isNearTo(goal)) this.moveTarget(goal, 1);
        else this.reposition(goal);
        return "wait";
    }

    // The mission's first listed target; with none listed the goal picked
    // before while it stands, else the nearest foreign rampart.
    wreckGoal(): Structure | null {
        const listed = _.first(this.coreMission.targets());
        const kept = this.goal?.s;
        const ramparts = () => this.c.room.find(FIND_HOSTILE_STRUCTURES).filter(s => s.structureType === STRUCTURE_RAMPART);
        const pick = listed || kept || this.pos.findClosestByRange(ramparts());
        this.goal = pick ? TStruct.make(pick) : null;
        return pick || null;
    }

    // The firing ladder (file header).
    fireDrill(): boolean {
        const c = this.cc;
        if (!c.intents.canRange()) return false;
        const m = this.coreMission;
        const room = c.room;
        const enemies = (room.enemies || room.find(FIND_HOSTILE_CREEPS))
            .filter(e => this.pos.inRangeTo(e, kShotRange) && coverHits(e.pos) <= kRampartSkip);
        const beside = enemies.filter(e => isActiveMilitant(e) && this.pos.isNearTo(e));
        if (beside.length) {
            if (this.massDamage() >= this.shotDamage()) return this.massAttack();
            return this.shoot(_.min(beside, e => e.hits));
        }
        const core = m?.core?.s;
        if (core && this.pos.inRangeTo(core, kShotRange)) return this.shoot(core);
        const wrecking = !!m && m.coreDead && this.memory.retire === false && this.pos.roomName === m.roomName;
        if (wrecking && this.massDamage() > 0) return this.massAttack();
        return this.idleRanged(enemies);
    }

    // Shoot an enemy creep in reach (`enemies`: those within 3 worth a
    // shot), the armed before the unarmed, the nearest. No movement.
    idleRanged(enemies: Creep[]): boolean {
        if (!enemies.length) return false;
        const armed = enemies.filter(isActiveMilitant);
        const pool = armed.length ? armed : enemies;
        return this.shoot(this.pos.findClosestByRange(pool) || pool[0]);
    }

    after() {
        const c = this.cc;
        if (!c) return;
        this.fireDrill();
        const m = this.coreMission;
        const underFire = !!m && !m.coreDead && this.towerThreat(c.room);
        if (!c.hurts && underFire && healSelf(c)) return;
        const near = _.any(c.room.enemies || c.room.find(FIND_HOSTILE_CREEPS), e => this.pos.inRangeTo(e, kShotRange));
        healIdle(c, near);
    }
}
