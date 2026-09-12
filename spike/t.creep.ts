// Spike copy of src/creep.ts re-rooted at TCreep.
//
// The body-stat maths become plain functions over a Creep, cached in the creep's
// own `cache`, so the kept Creep.prototype extender (needed for foreign creeps by
// strat.ts and struct.tower.js) and the wrapper share one implementation.
import { TCreep } from "tcreep";

declare global {
  interface CreepCache {
    partsByType?: Map<BodyPartConstant, number>
    activeByType?: Map<BodyPartConstant, number>
    activeHits?: number
    fullInfo?: PowerInfo
    nboosted?: number
    info?: PowerInfo
    infoHits?: number
  }
  interface CreepTick {
    weight?: number
    intents?: any
  }
}

export function partsByType(c: Creep): Map<BodyPartConstant, number> {
  if (!c.cache.partsByType) {
    c.cache.partsByType = new Map(_.pairs(_.countBy(c.body, part => part.type)) as [BodyPartConstant, number][]);
  }
  return c.cache.partsByType
}

export function activeByType(c: Creep): Map<BodyPartConstant, number> {
  if (!c.cache.activeByType || c.cache.activeHits !== c.hits) {
    const actives = _(c.body)
      .filter('hits')
      .countBy('type')
      .value();
    c.cache.activeByType = new Map(_.pairs(actives) as [BodyPartConstant, number][]);
    c.cache.activeHits = c.hits;
  }
  return c.cache.activeByType;
}

export function hurts(c: Creep): number {
  return c.hitsMax - c.hits
}

export function info(c: Creep): PowerInfo {
  if (!hurts(c)) {
    return fullInfo(c);
  }
  if (!c.cache.info || c.cache.infoHits !== c.hits) {
    c.cache.infoHits = c.hits;
    c.cache.info = bodyInfo(c);
  }
  return c.cache.info;
}

export function fullInfo(c: Creep): PowerInfo {
  const nboosted = _.sum(c.body, b => b.boost ? 1 : 0);
  if (!c.cache.fullInfo || nboosted !== c.cache.nboosted) {
    c.cache.nboosted = nboosted;
    c.cache.fullInfo = bodyInfo(c, true);
  }
  return c.cache.fullInfo;
}

export function isMelee(c: Creep): boolean {
  return !!activeByType(c).get(ATTACK);
}

export function isRanged(c: Creep): boolean {
  return !!activeByType(c).get(RANGED_ATTACK);
}

export function isHostile(c: Creep): boolean {
  return isMelee(c) || isRanged(c)
}

export function isAssault(c: Creep): boolean {
  return isHostile(c) || (activeByType(c).get(WORK) || 0) > 1 || (activeByType(c).get(HEAL) || 0) > 1;
}

export function weight(c: Creep): number {
  if (c.tick.weight === undefined) {
    c.tick.weight = calcWeight(c)
  }
  return c.tick.weight
}

// Fatigue generated when `c` moves.
export function calcWeight(c: Creep): number {
  let weight = 0
  let carry = c.store.getUsedCapacity()
  for (let i = c.body.length - 1; i >= 0; i--) {
    const part = c.body[i]
    switch (part.type) {
      case MOVE:
        break
      case CARRY:
        if (carry > 0) {
          weight++
          carry -= getPartInfo(part).capacity!
        }
        break
      default:
        weight++
        break
    }
  }
  return weight * 2
}

// Returns resource amounts from `c`s creation.
// If `current` then returns reclaimable resources.
export function bodyCost(c: Creep, current = false): Map<ResourceConstant, number> {
  const cost = new Map<ResourceConstant, number>();
  let energy = 0;
  let claim = false
  for (let part of c.body) {
    claim = claim || part.type === CLAIM
    energy += BODYPART_COST[part.type]
    if (part.boost) {
      const b = part.boost as ResourceConstant;
      cost.set(b, 30 + (cost.get(b) || 0));
    }
  }
  if (current) {
    const lifetime = claim ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME
    const scale = c.ticksToLive! / lifetime
    for (let [k, v] of cost) {
      cost.set(k, Math.floor(v * scale));
    }
  }
  return cost
}

// Info about the power of `c`s actions. See src/creep.ts for the key meanings.
export function bodyInfo(c: Creep, all = false): PowerInfo {
  const info = _.clone(defaultPowerInfo);
  for (let part of c.body) {
    if (!all && !part.hits) continue;
    const pinfo = getPartInfo(part);
    _.forEach(pinfo, (pow: number, action: any) => {
      info[action as keyof PowerInfo] += pow;
    });
  }
  return info
}

// The wrapper view: same member names as CreepExtra so mixin bodies compile unchanged.
export class CreepStats extends TCreep {
  get partsByType() { return partsByType(this.c) }
  get activeByType() { return activeByType(this.c) }
  get info() { return info(this.c) }
  get fullInfo() { return fullInfo(this.c) }
  get melee() { return isMelee(this.c) }
  get ranged() { return isRanged(this.c) }
  get hostile() { return isHostile(this.c) }
  get assault() { return isAssault(this.c) }
  get hurts() { return hurts(this.c) }
  get weight() { return weight(this.c) }

  get where() {
    return `<a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.pos.roomName}</a>`
  }

  calcWeight() { return calcWeight(this.c) }
  bodyCost(current = false) { return bodyCost(this.c, current) }
  bodyInfo(all = false) { return bodyInfo(this.c, all) }
}

const defaultPowerInfo = {
  attack: 0,
  attackController: 0,
  build: 0,
  capacity: 0,
  dismantle: 0,
  fatigue: 0,
  harvest: 0,
  heal: 0,
  hits: 0,
  mineral: 0,
  rangedAttack: 0,
  rangedHeal: 0,
  rangedMassAttack: 0,
  repair: 0,
  upgradeController: 0,
};

export type PowerInfo = typeof defaultPowerInfo

type PartInfos = {
  [part in BodyPartConstant]: Partial<PowerInfo>
}

const power: PartInfos = {
  [ATTACK]: {
    attack: ATTACK_POWER
  },
  [CARRY]: {
    capacity: CARRY_CAPACITY
  },
  [CLAIM]: {
    attackController: CONTROLLER_CLAIM_DOWNGRADE,
    upgradeController: UPGRADE_CONTROLLER_POWER
  },
  [HEAL]: {
    heal: HEAL_POWER,
    rangedHeal: RANGED_HEAL_POWER
  },
  [MOVE]: {
    fatigue: 2  // Huh! No constant for this?!
  },
  [RANGED_ATTACK]: {
    rangedAttack: RANGED_ATTACK_POWER,
    rangedMassAttack: RANGED_ATTACK_POWER
  },
  [TOUGH]: {
    hits: 0
  },
  [WORK]: {
    build: BUILD_POWER,
    dismantle: DISMANTLE_POWER,
    harvest: HARVEST_POWER,
    mineral: HARVEST_MINERAL_POWER,
    repair: REPAIR_POWER,
    upgradeController: UPGRADE_CONTROLLER_POWER
  }
}

function getPartInfo(part: BodyPartDefinition) {
  const partInfo = _.clone(power[part.type])
  if (part.boost) {
    const boost = BOOSTS[part.type as string][part.boost]
    for (let action in boost) {
      if (action === 'damage') {
        partInfo.hits! += Math.floor(part.hits * (1 - boost[action]))
        continue
      }
      if (action === 'harvest') {
        partInfo.mineral! *= boost[action]
      }
      partInfo[action as keyof PowerInfo]! *= boost[action]
    }
  }
  return partInfo
}
