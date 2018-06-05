const debug = require('debug')
const k = require('constants')
const spawners = require('spawners')

const gRoles = new Map()

class Role {
  static role () {
    return this.calcRole(this.name)
  }

  static calcRole (name) {
  }

  static find (name) {
    return gRoles.get(name) || this._make(name)
  }

  static _make (name) {
    const role = this.calcRole(name)
    try {
      const Klass = require(`role.${role}`)
      const r = new Klass(name)
      gRoles.set(name, r)
      this._cleanup()
      return r
    } catch (err) {
      debug.log(name, role, err, err.stack)
    }
    return null
  }

  static _cleanup () {
    const nroles = gRoles.size
    const ncreeps = _.size(Game.creeps)
    let n = nroles - ncreeps
    for (const name of gRoles.keys()) {
      if (!Game.creeps[name]) {
        gRoles.delete(name)
        n--
        if (n <= 0) break
      }
    }
  }

  static egg (flag) {
  }

  static body (spawns) {
  }

  init () {
    this.cache.intents = {}
  }

  spawning () {
    return this.c.spawningRun()
  }

  run () {
    return this.c.run()
  }

  after () {
    return this.c.after()
  }
}

class Ctrl extends Role {
  static egg (flag) {
    return this.makeEgg(flag, 10)
  }

  static spawn (name) {
    return new CtrlSpawner(name)
  }
}

class CtrlSpawner extends spawners.LocalSpawner {
  constructor (name) {
    super(name)
    this.extra = name
  }

  findSpawn () {
    const r = this.teamRoom
    if (!r) return null

    if (r.controller.level > 7) {
      return _.find(this.spawns, s => s.room.energyAvailable >= 2050)
    }

    if (r.controller.level > 6) {
      return _.find(this.spawns, s => s.room.energyAvailable >= 4200)
    }

    return this.fullSpawn()
  }

  body () {
    const r = this.teamRoom()
    if (!r) return null

    if (r.storage.energy < 150000) {
      return [MOVE, WORK, CARRY]
    }

    if (r.controller > 7 && this.energyAvailable >= 2050) {
      return [
        MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY]
    }

    if (this.energyAvailable >= 2050) {
      return [
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,

        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,

        CARRY, CARRY, CARRY, CARRY, CARRY]
    }

    const base = [CARRY]
    if (this.energyAvailable > k.RCL4Energy) {
      base.push(CARRY)
    }
    return this.bodyDef({
      move: 2,
      per: [WORK],
      base
    })
  }
}

module.exports = {
  Ctrl
}
