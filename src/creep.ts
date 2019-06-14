import * as lib from 'lib';
import * as debug from 'debug';
import { extender } from 'roomobj';
import { Dictionary } from 'lodash';

declare global {
  interface CreepCache {
    partsByType?: Map<BodyPartConstant, number>
    activeByType?: Map<BodyPartConstant, number>
    activeHits?: number
    fullInfo?: PowerInfo
    info?: PowerInfo
    infoHits?: number
  }
  interface CreepTick {
    weight?: number
    intents?: any
  }
}

@extender
export class CreepExtra extends Creep {
  get partsByType() {
    if (!this.cache.partsByType) {
      this.cache.partsByType = new Map(_.pairs(_.countBy(this.body, part => part.type)) as [BodyPartConstant, number][]);
    }
    return this.cache.partsByType
  }

  get activeByType() {
    if (!this.cache.activeByType || this.cache.activeHits !== this.hits) {
      const actives = _(this.body)
        .filter('hits')
        .countBy('type')
        .value();
      this.cache.activeByType = new Map(_.pairs(actives) as [BodyPartConstant, number][]);
      this.cache.activeHits = this.hits;
    }
    return this.cache.activeByType;
  }

  get info() {
    if (!this.hurts) {
      return this.fullInfo
    }
    if (!this.cache.info || this.cache.infoHits !== this.hits) {
      this.cache.infoHits = this.hits;
      this.cache.info = this.bodyInfo();
    }
    return this.cache.info
  }

  get fullInfo() {
    if (!this.cache.fullInfo) {
      this.cache.fullInfo = this.bodyInfo(true);
    }
    return this.cache.fullInfo;
  }

  get melee() {
    return !!this.activeByType.get(ATTACK);
  }

  get ranged() {
    return !!this.activeByType.get(RANGED_ATTACK);
  }

  get hostile() {
    return this.melee || this.ranged
  }

  get assault() {
    return this.hostile || (this.activeByType.get(WORK) || 0) > 1;
  }

  get where() {
    return `<a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.pos.roomName}</a>`
  }

  get spawnTime() {
    return CREEP_SPAWN_TIME * this.body.length
  }

  get carryTotal() {
    return _.sum(this.carry)
  }

  get carryFree() {
    return this.carryCapacity - this.carryTotal
  }

  get hurts() {
    return this.hitsMax - this.hits
  }

  get weight() {
    if (this.tick.weight === undefined) {
      this.tick.weight = this.calcWeight()
    }
    return this.tick.weight
  }

  // Fatigue generated when `creep` moves.
  calcWeight() {
    let weight = 0
    let carry = this.carryTotal
    for (let i = this.body.length - 1; i >= 0; i--) {
      const part = this.body[i]
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

  // Returns resource amounts from `creep` creation.
  // If `current` then returns reclaimable resources.
  bodyCost(current = false) {
    const cost = new Map<ResourceConstant, number>();
    let energy = 0;
    let claim = false
    for (let part of this.body) {
      claim = claim || part.type === CLAIM
      energy += BODYPART_COST[part.type]
      if (part.boost) {
        cost.set(part.boost, 30 + (cost.get(part.boost) || 0));
      }
    }
    if (current) {
      const lifetime = claim ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME
      const scale = this.ticksToLive! / lifetime
      for (let [k, v] of cost) {
        cost.set(k, Math.floor(v * scale));
      }
    }
    return cost
  }

  // Info about the power of `creep`s actions.
  // Most keys are standard action names
  // The exceptions:
  // * hits: a pseudo count of the extra hits available to boosted TOUGH parts.
  // * mineral: harvest power when harvesting a mineral.
  // * fatigue: is the fatigue removed by MOVE parts.
  // * capacity: is equivalent to `carryCapacity` unless `creep` is damaged.
  bodyInfo(all = false) {
    const info = _.clone(defaultPowerInfo);
    for (let part of this.body) {
      if (!all && !part.hits) continue;
      const pinfo = getPartInfo(part);
      _.forEach(pinfo, (pow: number, action:any) => {
        info[action as keyof PowerInfo] += pow;
      });
    }
    return info
  }
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

type PowerInfo = typeof defaultPowerInfo

// type PowerInfoDec = {
//   attack?: number
//   attackController?: number
//   build?: number
//   capacity?: number
//   dismantle?: number
//   fatigue?: number
//   harvest?: number
//   heal?: number
//   hits?: number
//   mineral?: number
//   rangedAttack?: number
//   rangedHeal?: number
//   rangedMassAttack?: number
//   repair?: number
//   upgradeController?: number
// }

type PartPower = keyof PowerInfo;

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

