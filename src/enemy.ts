// The enemy registry: one EnemyCreep (tcreep.ts) or EnemyPowerCreep
// (powercreep.ts) per foreign creep, keyed by id in a tobj.ts Registry, the
// same one TStruct uses: a wrapper whose creep is out of sight at a
// collection goes cold, one still missing at the next is dropped. Creeps die
// fast, so the period is short.
//
//   enemyOf(creep)        the wrapper for a hostile creep or power creep in view
//   enemyById(id)         the wrapper an id already has, else null
//   enemiesIn(room)       wrappers for every hostile creep and power creep in a visible room
import { Registry } from "tobj";
import { EnemyCreep } from "tcreep";
import { EnemyPowerCreep } from "powercreep";

export type Enemy = EnemyCreep | EnemyPowerCreep;

const kPeriod = 100;

export const enemies = new Registry<Enemy>("enemies", kPeriod);

// Throws for one of mine: its wrapper is a MyCreep/MyPowerCreep, and an
// EnemyCreep made from it would never resolve.
export function enemyOf(c: AnyCreep): Enemy {
    if (c.my) throw new Error(`enemyOf: ${c.name} is mine`);
    return enemies.get(c.id, () => c instanceof PowerCreep ? new EnemyPowerCreep(c) : new EnemyCreep(c));
}

export function enemyById(id: Id<AnyCreep>): Enemy | null {
    return enemies.peek(id);
}

export function enemiesIn(room: Room): Enemy[] {
    const creeps: AnyCreep[] = room.find(FIND_HOSTILE_CREEPS);
    const pcs: AnyCreep[] = room.find(FIND_HOSTILE_POWER_CREEPS);
    return creeps.concat(pcs).map(enemyOf);
}
