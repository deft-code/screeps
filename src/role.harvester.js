const lib = require('lib')

module.exports = class CreepHarvester {
  roleHarvestaga () {
    return this.roleHarvester(1)
  }

  roleHarvester (card = 0) {
    let what = this.taskTask()
    if (what) return what

    let src = lib.lookup(this.memory.src)
    if (!src) {
      if (!this.moveRoom(this.team)) {
        const srcs = this.teamRoom.find(FIND_SOURCES)
        const ss = _.sortBy(srcs, 'xy')
        src = ss[card]
        if (src) {
          this.memory.src = src.id
        } else {
          return false
        }
      } else {
        return false
      }
    }

    if (!this.pos.isEqualTo(src.bestSpot)) return this.movePos({pos: src.bestSpot})

    if (!this.memory.active) {
      this.memory.active = Game.time
    }

    const cont = this.makeCont()
    if (!cont) {
      const err = this.room.createConstructionSite(this.pos, STRUCTURE_CONTAINER)
      this.dlog('create site', err)
      return 'create'
    }

    if (cont instanceof ConstructionSite) {
      return this.taskBuild(cont) || this.taskHarvest(src)
    }

    if (this.carry.energy && cont.hurts > cont.hits) {
      return this.taskRepair(cont)
    }

    if (src.energy && cont.storeFree > this.info.harvest) {
      return this.goHarvest(src, false)
    }
    return this.taskRepair(cont) || this.goWithdraw(cont, RESOURCE_ENERGY, false) || 'waiting'
  }

  makeCont () {
    let cont = Game.getObjectById(this.memory.cont)
    if (cont) return cont

    for (const spot of this.pos.look()) {
      switch (spot.type) {
        case LOOK_CONSTRUCTION_SITES:
        case LOOK_STRUCTURES:
          const s = spot[spot.type]
          if (s.structureType === STRUCTURE_CONTAINER) {
            this.memory.cont = s.id
            return s
          }
          break
      }
    }
    return null
  }
}
