const routes = require('routes')

class Spawner {
  constructor (name) {
    this.name = name
  }

  get team () {
    return Game.flags[Memory.creeps[this.name]]
  }

  get teamRoom () {
    return this.team.room
  }

  get allSpawns () {
    if (!this._allSpawns) {
      this._allSpawns = _.shuffle(Game.spawns)
    }
    return this._allSpawns
  }

  get spawns () {
    if (!this._spawns) {
      this._spawns = this.findSpawns()
    }
    return this._spawns
  }

  fullSpawn () {
    return _.find(this.spawns, s => s.room.energyAvailable >= s.room.energyCapacityAvailable)
  }

  get energyAvailable () {
    if (!this.spawn) return 0
    return this.spawn.room.energyAvailable
  }

  body () {
    return []
  }

  spawnCreep () {
    if (!this.spawn) return ERR_BUSY

    return this.spawn.spawnCreep(this.body(), this.name)
  }
}

exports.LocalSpawner = class LocalSpawner extends Spawner {
  findSpawns () {
    let spawns = []
    let dist = 11
    for (const s of this.allSpawns) {
      const room = s.pos.roomName
      const d = routes.dist(this.team.name, room)
      if (d < dist) {
        dist = d
        spawns = [s]
      } else if (d === dist) {
        spawns.push(s)
      }
    }
    return spawns
  }
}

exports.CloseSpawner = class CloseSpawner extends Spawner {
  findSpawns () {
    const mdist = _(this.allSpawns)
      .map(s => routes.dist(this.team.name, s.pos.roomName))
      .min()
    return _.filter(this.allSpawns, s =>
      routes.dist(this.team.name, s.pos.roomName) <= mdist + 1)
  }
}

exports.RemoteSpawner = class RemoteSpawner extends Spawner {
  findSpawns () {
    const mdist = _(this.allSpawns)
      .map(s => routes.dist(this.team.name, s.pos.roomName))
      .filter(d => d > 0)
      .min()
    return _.filter(this.allSpawns, s => {
      const d = routes.dist(this.team.name, s.room.name)
      return d > 0 && d <= mdist
    })
  }
}

exports.MaxSpawner = class MaxSpawner extends Spawner {
  findSpawns () {
    const close = _.filter(this.allSpawns, s => routes.dist(this.team.name, s.pos.roomName) <= 10)
    const mlvl = _.max(close.map(s => s.room.controller.level))
    const lvl = _.filter(close, s => s.room.controller.level >= mlvl)
    const mspawn = _.min(lvl, s => routes.dist(this.team.name, s.pos.roomName))
    const mdist = routes.dist(this.team.name, mspawn.pos.roomName) + 1
    return _.filter(lvl, s => routes.dist(this.team.name, s.pos.roomName) <= mdist)
  }
}
