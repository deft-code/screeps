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
