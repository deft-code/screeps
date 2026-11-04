import type { CreepMove } from "creep.move";

// Whom a fighter heals when it has nothing to shoot: shared by every
// military job that falls back to healing (JobCreep.pickHurt for Guard,
// Crow, Toxic; Guard.after's opportunistic heals; creep.heal.js idleHeal
// for the Skhunter and the legacy roles). Our hurt creeps with ATTACK or
// RANGED_ATTACK parts come first: a fighter back at full hits goes on
// fighting, a civilian can wait. Among the chosen pool the caller's score
// (usually hits lost) decides.

// A creep built to fight: any ATTACK or RANGED_ATTACK part, broken or not.
export function isFighter(c: Creep): boolean {
    return _.any(c.body, p => p.type === ATTACK || p.type === RANGED_ATTACK);
}

// Our hurt creeps among `creeps`.
export function hurtFriendlies(creeps: Creep[]): Creep[] {
    return creeps.filter(c => c.my && c.hits < c.hitsMax);
}

// The one to heal from `hurt`: the highest `score` among the fighters when
// any is there, else among them all; null for an empty list.
export function healPick(hurt: Creep[], score: (c: Creep) => number = c => c.hitsMax - c.hits): Creep | null {
    if (!hurt.length) return null;
    const fighters = hurt.filter(isFighter);
    const pool = fighters.length ? fighters : hurt;
    return _.max(pool, score) as Creep;
}

// Heal ourselves, taking the heal intent (intents.melee); false when it is
// taken, no HEAL part works or the call fails.
export function healSelf(c: CreepMove): boolean {
    if (!c.intents.canAttack() || !c.activeByType.get(HEAL)) return false;
    if (c.heal(c) !== OK) return false;
    c.intents.setAttack(c);
    return true;
}

// The idle heal cascade (role.guard.js afterGuard, shared by Guard.after
// and the wick, job.wicktwo.ts): nothing while the heal intent is taken or
// no HEAL part works; self while hurt; else the most hurt adjacent friendly
// (fighters first, healPick); else one within rangedHeal reach when the
// ranged intent is free; else, with `overheal`, self: heals land after the
// tick's damage, so one queued under fire is never wasted. True when a heal
// was queued.
export function healIdle(c: CreepMove, overheal: boolean): boolean {
    if (!c.intents.canAttack() || !c.activeByType.get(HEAL)) return false;
    if (c.hurts) return healSelf(c);
    const near = hurtFriendlies(c.room.lookForAtRange(LOOK_CREEPS, c.pos, 3, true)
        .map(spot => spot[LOOK_CREEPS] as Creep));
    const adjacent = healPick(near.filter(f => c.pos.isNearTo(f)));
    if (adjacent) {
        if (c.heal(adjacent) !== OK) return false;
        c.intents.setAttack(adjacent);
        return true;
    }
    const far = healPick(near);
    if (far && c.intents.canRange()) {
        if (c.rangedHeal(far) !== OK) return false;
        c.intents.setWork(far);
        return true;
    }
    return overheal && healSelf(c);
}
