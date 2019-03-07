const lib = require('lib')
const debug = require('debug')

class CreepExtra {
  get home() {
    if (!this.memory.home) {
      this.memory.home = this.pos.roomName
    }
    return Game.rooms[this.memory.home] || this.teamRoom || this.room
  }

  get team() {
    const t = Game.flags[this.memory.team]
    if(!t) {
      const team = _.last(this.name.split('_', 2));
      return Game.flags[team];
    }
    return t
  }

  get atTeam() {
    return this.room.name === this.team.pos.roomName
  }

  get atHome() {
    return this.room.name === this.memory.home
  }

  get teamRoom() {
    return this.team && this.team.room
  }

  get partsByType() {
    if (!this._partsByType) {
      this._partsByType = _(this.body)
        .countBy('type')
        .value()
    }
    return this._partsByType
  }

  get activeByType() {
    if (!this._activeByType) {
      this._activeByType = _(this.body)
        .filter('hits')
        .countBy('type')
        .value()
    }
    return this._activeByType
  }

  get info() {
    if (!this.hurts) {
      return this.fullInfo
    }
    if (!this._info) {
      this._info = this.bodyInfo()
    }
    return this._info
  }

  get fullInfo() {
    if (this.my) {
      let info = this.memory.info
      if (!info) {
        info = this.memory.info = this.bodyInfo(true)
      }
      return info
    }
    if (!this._fullInfo) {
      this._fullInfo = this.bodyInfo(true)
    }
    return this._fullInfo
  }

  get ignoreRoads() {
    return this.body.length >= 2 * this.getActiveBodyparts(MOVE)
  }

  get melee() {
    return this.activeByType[ATTACK]
  }

  get ranged() {
    return this.activeByType[RANGED_ATTACK]
  }

  get hostile() {
    return this.melee || this.ranged
  }

  get assault() {
    return this.hostile || this.activeByType[WORK] > 1
  }

  get role() {
    return _.first(_.words(this.name))
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
    if (!this._weight) {
      this._weight = this.calcWeight()
    }
    return this._weight
  }
}
lib.merge(Creep, CreepExtra)

Room.prototype.spawningRun = function () {
  if (!this.controller) return
  if (!this.controller.my) return
  const spawns = _.shuffle(this.findStructs(STRUCTURE_SPAWN))
  for (const spawn of spawns) {
    if (!spawn.spawning) break
    const c = Game.creeps[spawn.spawning.name]
    if (c) {
      c.spawningRun()
    } else {
      this.log(`Missing creep '${spawn.spawning.name}' from '${spawn.name}', left ${spawn.spawning.remainingTime}`)
    }
  }
}

Creep.prototype.spawningRun = function () {
  if (!this.spawning) {
    debug.log(this, 'Not Spawning!')
    return
  }
  if (!this.memory.home) {
    this.memory.home = this.room.name
    this.memory.cpu = 0
  }
  this.doBoosts()
}

Creep.prototype.run = function () {
  if (this.spawning) {
    debug.log(this, "shouldn't be spawning")
    return 'spawning'
  }

  const start = Game.cpu.getUsed()
  this.intents = {}

  const role = _.camelCase('role ' + this.role)
  const roleFunc = this[role] || this.roleUndefined
  const what = roleFunc.apply(this)

  if (this.memory.task) {
    const first = this.memory.task.first
    if (first && first.roomName === this.room.name) {
      this.room.visual.line(this.pos, first)
    }
    delete this.memory.task.first
  }

  const total = Math.floor(1000 * (Game.cpu.getUsed() - start))
  this.memory.cpu += total

  let rate = this.memory.cpu
  const age = CREEP_LIFE_TIME - this.ticksToLive
  if (age > 0) {
    rate = Math.floor(rate / age)
  }

  this.dlog(`cpu ${total}:${rate} ${what}`)
}

Creep.prototype.after = function () {
  if (!this.intents) {
    debug.log(this, 'missing intents!')
  }
  const start = Game.cpu.getUsed()

  const after = _.camelCase('after ' + this.role)
  const afterFunc = this[after] || this.afterUndefined
  if (_.isFunction(afterFunc)) afterFunc.apply(this)

  const total = Math.floor(1000 * (Game.cpu.getUsed() - start))
  this.memory.cpu += total
}

// Fatigue generated when `creep` moves.
Creep.prototype.calcWeight = function () {
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
          carry -= getPartInfo(part).capacity
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
Creep.prototype.bodyCost = function (current) {
  const cost = {
    energy: 0
  }
  let claim = false
  for (let part of this.body) {
    claim = claim || part.type === CLAIM
    cost.energy += BODYPART_COST[part.type]
    if (part.boost) {
      cost[part.boost] = 30 + cost[part.boost] || 0
    }
  }
  if (current) {
    const lifetime = claim ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME
    const scale = this.ticksToLive / lifetime
    for (let res in cost) {
      cost[res] = Math.floor(cost[res] * scale)
    }
  }
  return cost
}

const power = {}
power[ATTACK] = {
  attack: ATTACK_POWER
}
power[CARRY] = {
  capacity: CARRY_CAPACITY
}
power[CLAIM] = {
  attackController: CONTROLLER_CLAIM_DOWNGRADE,
  upgradeController: UPGRADE_CONTROLLER_POWER
}
power[HEAL] = {
  heal: HEAL_POWER,
  rangedHeal: RANGED_HEAL_POWER
}
power[MOVE] = {
  fatigue: 2  // Huh! No constant for this?!
}
power[RANGED_ATTACK] = {
  rangedAttack: RANGED_ATTACK_POWER,
  rangedMassAttack: RANGED_ATTACK_POWER
}
power[TOUGH] = {
  hits: 0
}
power[WORK] = {
  build: BUILD_POWER,
  dismantle: DISMANTLE_POWER,
  harvest: HARVEST_POWER,
  mineral: HARVEST_MINERAL_POWER,
  repair: REPAIR_POWER,
  upgradeController: UPGRADE_CONTROLLER_POWER
}

function getPartInfo(part) {
  const partInfo = _.clone(power[part.type])
  if (part.boost) {
    const boost = BOOSTS[part.type][part.boost]
    for (let action in boost) {
      if (action === 'damage') {
        partInfo.hits += Math.floor(part.hits * (1 - boost[action]))
        continue
      }
      if (action === 'harvest') {
        partInfo.mineral *= boost[action]
      }
      partInfo[action] *= boost[action]
    }
  }
  return partInfo
}

// Info about the power of `creep`s actions.
// Most keys are standard action names
// The exceptions:
// * hits: a pseudo count of the extra hits available to boosted TOUGH parts.
// * mineral: harvest power when harvesting a mineral.
// * fatigue: is the fatigue removed by MOVE parts.
// * capacity: is equivalent to `carryCapacity` unless `creep` is damaged.
Creep.prototype.bodyInfo = function (all) {
  let info = {}
  for (let part of _.values(power)) {
    for (let action in part) {
      info[action] = 0
    }
  }

  for (let i = 0; i < this.body.length; i++) {
    const part = this.body[i]
    if (!all && !part.hits) continue
    const pinfo = getPartInfo(part)
    for (let action in pinfo) {
      info[action] += pinfo[action]
    }
  }
  return info
}
