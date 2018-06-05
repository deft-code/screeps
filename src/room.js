const lib = require('lib')

class RoomExtras {
  get energyFreeAvailable () {
    return Math.max(0, this.energyCapacityAvailable - this.energyAvailable)
  }

  get wallMax () {
    if (!this.controller) return 0
    if (!this.controller.my) return 0

    switch (this.controller.level) {
      case 1: return 0
      case 2: return 100
      case 3:
      case 4: return 10000
      case 5: return 100000
      case 6: return 1000000
      case 7: return 6000000
      case 8: return 21000000
    }
    return 0
  }
}
lib.merge(Room, RoomExtras)

Room.prototype.stats = function () {
  if (!Memory.stats.rooms) {
    Memory.stats.rooms = {}
  }
  if (!this.controller) return
  Memory.stats.rooms[this.name] = {
    rcl: this.controller.level,
    controllerProgress: this.controller.progress,
    controllerProgressTotal: this.controller.progressTotal
  }
}

Room.prototype.runFlags = function () {
  const flags = _.shuffle(this.find(FIND_FLAGS))
  for (const flag of flags) {
    try {
      flag.run()
    } catch (err) {
      this.log(flag, err, err.stack)
    }
  }
}

Room.prototype.findStructs = function (...types) {
  if (!this.structsByType) {
    this.structsByType =
        _.groupBy(this.find(FIND_STRUCTURES), 'structureType')
  }
  return _.flatten(_.map(types, sType => this.structsByType[sType] || []))
}

Room.prototype.lookForAtRange = function (look, pos, range, array) {
  return this.lookForAtArea(
        look, Math.max(0, pos.y - range), Math.max(0, pos.x - range),
        Math.min(49, pos.y + range), Math.min(49, pos.x + range), array)
}

Room.prototype.addSpot = function (name, p) {
  if (!_.isFinite(p)) {
    p = this.packPos(p)
  }
  const spots = this.memory.spots = this.memory.spots || {}
  spots[name] = p
}

Room.prototype.getSpot = function (name) {
  const xy = (this.memory.spots || {})[name]
  if (!xy) return null
  return this.unpackPos(xy)
}

Room.prototype.drawSpots = function () {
  let i = 1
  _.forEach(this.memory.spots, (xy, name) => {
    const x = this.controller.pos.x
    const y = this.controller.pos.y
    const p = this.unpackPos(xy)
    this.visual.text(name, x, y + i)
    this.visual.line(x, y + i, p.x, p.y, {lineStyle: 'dashed'})
    i++
  })
}

const kAllies = [
]

function ratchet (room, what, up) {
  const twhat = `t${what}`
  const whattime = `${what}time`

  if (!room.memory[whattime]) room.memory[whattime] = Game.time

  if (up) {
    if (!room.memory[twhat]) room.memory[twhat] = 0
    room.memory[twhat]++
    room.memory[whattime] = Game.time
  } else {
    const delta = Game.time - room.memory[whattime]
    if (delta > 10) {
      room.memory[twhat] = 0
    }
  }
}

Room.prototype.init = function () {
  const nstructs = this.find(FIND_STRUCTURES).length
  this.deltaStructs = nstructs !== this.memory.nstructs
  this.memory.nstructs = nstructs

  this.allies = []
  this.enemies = []
  this.hostiles = []
  this.assaulters = []
  this.melees = []

  for (let c of this.find(FIND_CREEPS)) {
    if (!c.my) {
      if (_.contains(kAllies, c.owner.username)) {
        this.allies.push(c)
      } else {
        this.enemies.push(c)
        if (c.hostile) this.hostiles.push(c)
        if (c.assault) this.assaulters.push(c)
        if (c.melee) this.melees.push(c)
      }
    }
  }

  ratchet(this, 'hostiles', this.hostiles.length)
  ratchet(this, 'assaulters', this.assaulters.length)
  ratchet(this, 'enemies', this.enemies.length)
}

Room.prototype.combatCreeps = function () {
  if (this.enemies.length) {
    this.runCreeps()
  }
}

Room.prototype.claimCreeps = function () {
  if (this.enemies.length < 1 &&
      this.controller && this.controller.my) {
    this.runCreeps()
  }
}

Room.prototype.remoteCreeps = function () {
  if (this.enemies.length < 1 &&
      (!this.controller || !this.controller.my)) {
    this.runCreeps()
  }
}

Room.prototype.runCreeps = function () {
  const creeps = this.find(FIND_MY_CREEPS)
  for (const creep of creeps) {
    try {
      creep.run()
    } catch (err) {
      this.log(creep, err, '\n', err.stack)
    }
  }
}

Room.prototype.combatAfter = function () {
  if (this.enemies.length) {
    this.runAfter()
  }
}

Room.prototype.otherAfter = function () {
  if (this.enemies.length < 1) {
    this.runAfter()
  }
}

Room.prototype.runAfter = function () {
  const creeps = this.find(FIND_MY_CREEPS)
  for (const creep of creeps) {
    try {
      creep.after()
    } catch (err) {
      this.log(creep, err, '\n', err.stack)
    }
  }
}

Room.prototype.runDefense = function () {
  if (this.controller && this.controller.my) {
    if (this.assaulters.length) {
      const structs = this.findStructs(
          STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION)
      if (_.find(structs, s => s.hits < s.hitsMax)) {
        const ret = this.controller.activateSafeMode()
        this.log('SAFE MODE!', ret)
        Game.notify(`SAFE MODE:${ret}! ${this}`, 30)
      }
    }
  }
}
