const lib = require('lib')
const k = require('constants')

class LabExtra {
  mineralFill () {
    if (!this.planType) return false
    if (this.mineralType && this.planType !== this.mineralType) return false
    if (this.boost) {
      return this.mineralAmount < 1800
    }
    if (this.planType === this.room.memory.labs.current) {
      return false
    }
    return this.mineralAmount < 400
  }

  mineralDrain () {
    if (this.mineralAmount && this.planType !== this.mineralType) return true
    if (this.boost) {
      return this.mineralAmount > 2400
    }
    if (this.planType === this.room.memory.labs.current) {
      return this.mineralAmount >= 500
    }
    return this.mineralAmount >= 900
  }

  get boost () {
    if (!this.memory.boost) return null
    if (Game.time > this.memory.boostTime) {
      delete this.memory.boost
      return null
    }
    return this.memory.boost
  }

  set boost (mineral) {
    if (!_.contains(RESOURCES_ALL, mineral)) {
      delete this.memory.boost
      return null
    }
    this.memory.boost = mineral
    this.memory.boostTime = Game.time + 15
    return this.memory.boost
  }

  get planType () {
    return this.boost || this.memory.planType || null
  }

  set planType (mineral) {
    if (!_.contains(RESOURCES_ALL, mineral)) {
      delete this.memory.planType
      return null
    }
    this.memory.planType = mineral
    return this.memory.planType
  }

  get mineralFree () {
    return this.mineralCapacity - this.mineralAmount
  }

  get memory () {
    if (!this.my) return {}
    const labmem = this.room.memory.labs
    let mem = labmem[this.id]
    if (!mem) {
      mem = labmem[this.id] = {
        note: this.note
      }
      console.log('Creating lab memory for:', this.note)
    }
    return mem
  }
}

lib.merge(StructureLab, LabExtra)

StructureTerminal.prototype.setLabs = function (resource) {
  if (this.room.memory.labs.current === resource) {
    this.room.log('skip set', resource)
    return
  }

  this.room.memory.labs.current = resource

  const labs = this.room.orderedLabs()

  if (labs.length < 3) return

  labs[0].planType = k.Reactions[resource][0]
  labs[1].planType = k.Reactions[resource][1]

  for (let i = 2; i < labs.length; i++) {
    labs[i].planType = resource
  }
}

StructureTerminal.prototype.autoReact = function (mineral) {
  this.room.log('Mineral:', mineral)
  for (const part of k.Reactions[mineral]) {
    if (_.contains(k.CoreMinerals, part)) continue
    if (this.store[part] >= 2000) continue
    return this.autoReact(part)
  }
  return mineral
}

function mineralPlan (room) {
  if (Game.shard.name === 'swc') {
    return [
      [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, 20 * 30],
      [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 20 * 30],
      [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, 25 * 30],
      [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, 25 * 30],
      [RESOURCE_CATALYZED_UTRIUM_ACID, 500],
      [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, 5000],
      [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, 5000],
      [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 5000]
    ]
  }

  return [
    [RESOURCE_CATALYZED_UTRIUM_ACID, 5000],
    [RESOURCE_CATALYZED_GHODIUM_ACID, 5000],
    [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, 5000],
    [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, 5000],
    [RESOURCE_CATALYZED_ZYNTHIUM_ACID, 5000],
    [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 5000],
    [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, 5000],
    [RESOURCE_GHODIUM, 5000],
    [RESOURCE_CATALYZED_LEMERGIUM_ACID, 5000]
  ]
}

StructureTerminal.prototype.autoReactAll = function (override = false) {
  if (!override && (Game.time + this.pos.xy) % 500 !== 0) return
  if (this.room.findStructs(STRUCTURE_LAB).length < 3) return

  const plans = mineralPlan(this)

  for (const [boost, n] of plans) {
    this.room.log(boost, n)
    if (this.store[boost] > n) continue
    this.setLabs(this.autoReact(boost))
    return
  }
  this.setLabs(RESOURCE_CATALYZED_GHODIUM_ACID)
}

Room.prototype.orderedLabs = function () {
  const labIds = this.memory.labs.order || []
  const labs = this.findStructs(STRUCTURE_LAB)
  if (labIds.length !== labs.length) {
    for (const l1 of labs) {
      l1.v = 0
      for (const l2 of labs) {
        l1.v += l1.pos.getRangeTo(l2)
      }
      this.visual.text(l1.v, l1.pos)
    }
    labs.sort((a, b) => a.v - b.v)
    delete this.memory.labs.current
    this.memory.labs.order = labs.map(l => l.id)
  }
  return _.map(this.memory.labs.order, id => Game.structures[id])
}

function shortMineral (mineral) {
  switch (mineral) {
    case RESOURCE_CATALYZED_GHODIUM_ACID:
    case RESOURCE_CATALYZED_KEANIUM_ACID:
    case RESOURCE_CATALYZED_LEMERGIUM_ACID:
    case RESOURCE_CATALYZED_UTRIUM_ACID:
    case RESOURCE_CATALYZED_ZYNTHIUM_ACID:
    case RESOURCE_GHODIUM_ACID:
    case RESOURCE_KEANIUM_ACID:
    case RESOURCE_LEMERGIUM_ACID:
    case RESOURCE_UTRIUM_ACID:
    case RESOURCE_ZYNTHIUM_ACID:
      return mineral.substr(0, 3)
    case RESOURCE_GHODIUM_ALKALIDE:
    case RESOURCE_KEANIUM_ALKALIDE:
    case RESOURCE_LEMERGIUM_ALKALIDE:
    case RESOURCE_UTRIUM_ALKALIDE:
    case RESOURCE_ZYNTHIUM_ALKALIDE:
      return mineral[0] + 'O2'
    case RESOURCE_CATALYZED_GHODIUM_ALKALIDE:
    case RESOURCE_CATALYZED_KEANIUM_ALKALIDE:
    case RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE:
    case RESOURCE_CATALYZED_UTRIUM_ALKALIDE:
    case RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE:
      return mineral.substr(0, 2) + 'O'
  }
  return mineral
}

Room.prototype.runLabs = function () {
  if (!this.controller || !this.controller.my) return
  if (!this.memory.labs) {
    this.memory.labs = {}
    this.log('Creating memory for labs')
  }
  if (this.terminal && this.terminal.my) {
    this.terminal.autoReactAll()
  }
  const labs = this.orderedLabs()
  for (let lab of labs) {
    if (lab.mineralType) {
      this.visual.text(shortMineral(lab.mineralType),
        lab.pos.x + 0.05, lab.pos.y + 0.1,
        {color: 'black', font: 0.4})
    }
    if (lab.planType) {
      let color = 'cornflowerblue'
      if (lab.boost) color = 'yellow'
      this.visual.text(shortMineral(lab.planType),
        lab.pos.x, lab.pos.y + 0.1,
        {color, font: 0.4})
    }
  }

  let reactions = 0
  for (let i = 2; i < labs.length; i++) {
    const lab = labs[i]
    if (lab.cooldown) continue
    if (this.terminal.store[lab.planType] > 10000) continue
    if (!lab.mineralType && lab.planType !== this.memory.labs.current) continue
    if (lab.mineralType && lab.planType !== lab.mineralType) continue
    const err = lab.runReaction(labs[0], labs[1])
    if (err !== OK) {
      this.dlog(lib.errStr(err), 'lab', i, labs[0].mineralType, '+', labs[1].mineralType, '=', lab.mineralType)
    } else {
      reactions++
      if (reactions > 1) break
    }
  }
}

Room.prototype.requestBoosts = function (boosts) {
  for (const boost of boosts) {
    this.requestBoost(boost)
  }
}

Room.prototype.requestBoost = function (boost) {
  const lab = this.findBoostLab(boost)
  if (!lab) {
    this.log('Failed to boost:', boost)
    return null
  }
  lab.boost = boost
  return lab
}

Room.prototype.findBoostLab = function (boost) {
  const labs = this.orderedLabs().slice().reverse()
  return _.find(labs, l => l.boost === boost) ||
    _.find(labs, l => l.planType === boost) ||
    _.find(labs, l => !l.boost) ||
    null
}
