const debug = require('debug')
const k = require('constants')
const lib = require('lib')

class FlagExtra {
  get creeps () {
    if (!this._creeps) {
      this._creeps = _(this.memory.creeps)
        .map(c => Game.creeps[c])
        .filter(c => c && !c.spawning)
        .value()
    }
    return this._creeps
  }

  get creepsByRole () {
    if (!this._creepsByRole) {
      this._creepsByRole = _.groupBy(this.creeps, 'role')
    }
    return this._creepsByRole
  }

  get countByRole () {
    if (!this._countByRole) {
      this._countByRole = _.countBy(this.memory.creeps,
        n => _.first(_.words(n)))
    }
    return this._countByRole
  }
}

lib.merge(Flag, FlagExtra)

Flag.prototype.countRole = function (role) {
  return this.countByRole[role] || 0
}

Flag.prototype.roleCreeps = function (role) {
  return this.creepsByRole[role] || []
}

Flag.prototype.darkTeam = function () {
  return this.paceRole('scout', 1500, {})
}

Flag.prototype.runTeam = function () {
  const gone = gc(this)
  if (gone.length) {
    debug.log('Cleaned up', gone)
  }

  switch (this.secondaryColor) {
    case COLOR_BLUE: return this.teamCore()
    case COLOR_GREEN: return this.teamFarm()
  }
  // debug.log(this, 'Missing team')
}

function gc (flag) {
  flag.memory.creeps = flag.memory.creeps || []
  for (let cname of flag.memory.creeps) {
    if (!Memory.creeps[cname]) {
      return _.remove(flag.memory.creeps, c => c === cname)
    }
    if (!Game.creeps[cname] && !Memory.creeps[cname].egg) {
      delete Memory.creeps[cname]
      return _.remove(flag.memory.creeps, c => c === cname)
    }
  }
  return []
}

Flag.prototype.paceRole = function (role, rate, mem) {
  if (rate < 150) return false

  const when = this.memory.when = this.memory.when || {}
  const wrole = when[role]
  if (!wrole || wrole + rate < Game.time) {
    when[role] = Game.time
    const fname = `${role}Egg`
    return this[fname](mem)
  }
  return false
}

Flag.prototype.replaceRole = function (role, want, mem) {
  const total = this.countRole(role)
  const n = this.roleCreeps(role).length
  this.dlog(role, total, ':', n)
  if (total > n) return false

  const ttl = _.sum(this.roleCreeps(role), 'ticksToLive')
  this.dlog(role, ttl, want)
  if (ttl >= want) return false
  debug.log(role, ttl, want, this.roleCreeps(role))

  const fname = `${role}Egg`
  return this[fname](mem)
}

Flag.prototype.ensureRole = function (role, want, mem) {
  const have = this.countRole(role)
  if (have > want) return false
  const fname = `${role}Egg`
  if (have < want) return this[fname](mem)

  let ttl = 1500
  let stime = 150
  const creeps = this.roleCreeps(role)
  for (const c of creeps) {
    ttl = Math.min(c.ticksToLive, ttl)
    stime = Math.max(c.spawnTime, stime)
  }
}

Flag.prototype.teamCore = function () {
  return reboot(this) ||
    hauler(this) ||
    shunts(this) ||
    coresrc(this) ||
    auxsrc(this) ||
    defender(this) ||
    micro(this) ||
    worker(this) ||
    controller(this) ||
    mineral(this) ||
    false
}

Flag.prototype.teamFarm = function () {
  return suppressGuard(this) ||
    suppressWolf(this) ||
    reserve(this) ||
    miner(this) ||
    cart(this) ||
    false
}

function controller (flag) {
  let cap = flag.room.energyAvailable

  if (flag.room.storage) {
    if (flag.room.storage.store.energy < k.EnergyReserve) {
      cap = k.RCL2Energy
    }
  }
  return flag.replaceRole('ctrl', 28, {egg: {ecap: cap}})
}

function hauler (flag) {
  const storage = flag.room.storage
  let nhauler = 150
  if (!storage) {
    nhauler += 1500
  }
  return flag.replaceRole('hauler', nhauler)
}

function auxsrc (flag) {
  return flag.replaceRole('auxsrc', 1)
}

function coresrc (flag) {
  return flag.replaceRole('coresrc', 1)
}

function reboot (flag) {
  const creeps = flag.room.find(FIND_MY_CREEPS)
  if (_.some(creeps, c => c.role === 'hauler')) return false

  return flag.replaceRole('reboot', 1)
}

function reserve (flag) {
  if (flag.room.memory.thostiles) return false

  const controller = flag.room.controller
  const claimed = controller && controller.owner && !controller.my
  if (claimed) return false

  if (controller.resTicks > 4000) return false

  return flag.paceRole('reserver', 500, {})
}

function cart (flag) {
  const n = flag.room.find(FIND_SOURCES).length
  if (!n) return false

  return flag.paceRole('cart', 1400 / n)
}

function defender (flag) {
  if (flag.room.memory.tassaulters < 5) return false

  return flag.replaceRole('defender', 1500 * flag.room.assaulters.length)
}

function micro (flag) {
  if (flag.room.memory.tassaulters > 0) return false
  if (flag.room.memory.tenemies <= 0) return false

  return flag.paceRole('micro', 1500)
}

function miner (flag) {
  const n = flag.room.find(FIND_SOURCES).length
  if (!n) return false

  return flag.paceRole('miner', 1400 / n)
}

function mineral (flag) {
  const xtr = _.first(flag.room.findStructs(STRUCTURE_EXTRACTOR))
  if (!xtr) return false

  if (!flag.room.terminal) return false

  if (flag.room.terminal.storeFree > 50000) return false

  const p = flag.room.getSpot('mineral')
  const structs = p.lookFor(LOOK_STRUCTURES)
  const cont = _.find(structs, s => s.structureType === STRUCTURE_CONTAINER)
  if (!cont) {
    if (!flag.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
      p.createConstructionSite(STRUCTURE_CONTAINER)
    }
    return false
  }

  const m = _.first(flag.room.find(FIND_MINERALS))
  if (!m.mineralAmount) return false

  if (flag.replaceRole('mineral', 150, {cont: cont.id})) return 'mineral'

  if (cont.storeTotal >= 1650) {
    return flag.replaceRole('minecart', 150, {cont: cont.id})
  }

  return false
}

function suppressGuard (flag) {
  const t = flag.room.memory.thostiles
  if (t < 3) return false
  const rate = Math.max(1500 - t, 350)
  return flag.paceRole('guard', rate)
}

function suppressWolf (flag) {
  const t = flag.room.memory.thostiles
  if (t < 300) return false
  const rate = Math.max(1500 - t, 350)
  return flag.paceRole('wolf', rate)
}

function worker (flag) {
  let n = 0
  if (flag.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
    n = 1
  } else if (flag.room.storage && flag.room.storage.my && flag.room.storage.store.energy > 500000) {
    n = 1
  }
  return flag.replaceRole('worker', n)
}

function shunts (flag) {
  let ncore = 0
  let naux = 0
  if (flag.room.storage && flag.room.storage.my) {
    ncore = 1
  }

  if (flag.room.terminal && flag.room.terminal.my) {
    naux = 1
  }

  return flag.replaceRole('core', ncore) ||
    flag.replaceRole('aux', naux)
}
