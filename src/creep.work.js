import * as lib from 'lib';
// import * as debug from 'debug';

module.exports = class CreepWork {
  idleEmergencyUpgrade () {
    if (!this.carry.energy) return false
    const controller = this.room.controller
    if (!controller || !controller.my) return false
    if (controller.level === 8 && controller.ticksToDowngrade > 2000) return false
    if (controller.progress < controller.progressTotal && controller.ticksToDowngrade > 2000) return false
    if (Game.shard.ptr && controller.ticksToDowngrade > 2000) return false

    return this.taskUpgradeRoom()
  }

  idleUpgrade () {
    if (this.intents.melee || this.intents.range) return false

    return this.goUpgradeController(this.room.controller, false)
  }

  taskUpgradeRoom () {
    return this.taskUpgrade(this.room.controller)
  }

  taskUpgrade (controller) {
    if (!this.carry.energy) return false
    controller = this.checkId('upgrade', controller)
    if (!controller || !controller.my) return false
    return this.goUpgradeController(controller)
  }

  taskReserveRoom () {
    return this.taskReserve(this.room.controller)
  }

  taskReserve (controller) {
    controller = this.checkId('reserve', controller)

    const err = this.reserveController(controller)
    if (err === OK) {
      return controller.resTicks
    }
    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(controller)
    }
    this.say(`bad reserve ${err}`)
    return false
  }

  goUpgradeController (controller, move = true) {
    const err = this.upgradeController(controller)
    if (err === OK) {
      this.intents.melee = this.intents.range = controller
      return controller.progress || 'MAX!'
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveRange(controller)
    }
    return false
  }

  idleHarvest () {
    if (this.intents.melee || this.intents.range) return false
    const srcs = this.room.find(FIND_SOURCES_ACTIVE)
    const src = _.find(srcs, s => this.pos.isNearTo(s))
    return this.goHarvest(src, false)
  }

  taskHarvestSpots () {
    for (const src of this.room.find(FIND_SOURCES_ACTIVE)) {
      if (!this.pos.isNearTo(src)) continue
      return this.taskHarvest(src)
    }

    const srcs = _(this.room.find(FIND_SOURCES))
      .filter(s => s.energy || this.pos.getRangeTo(s) > s.ticksToRegeneration)
      .sortBy(s => this.pos.getRangeTo(s))
      .value()
    this.dlog('harvest spots', srcs)
    for (const src of srcs) {
      const spots = _.shuffle(src.spots)
      for (const spot of spots) {
        this.dlog('harvest spot', src, spot)
        const creeps = this.room.lookForAt(LOOK_CREEPS, spot)
        if (creeps.length) continue
        return this.taskHarvest(src, spot)
      }
    }
  }

  goHarvest (src, move = true) {
    const err = this.harvest(src)
    this.dlog(`goharvest ${err}`)
    if (err === OK) {
      this.intents.melee = this.intents.range = src
      return src.energy
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveNear(src)
    }
    return false
  }

  taskHarvest (src) {
    if (!this.carryFree) return false
    src = this.checkId('harvest', src)
    this.dlog('harvest', src)
    if (!src || !src.energy) return false

    let spot = lib.roomposFromMem(this.memory.task.spot)
    this.dlog('harvest spot', spot)
    if (!spot) {
      // debug.warn(this, 'BAD SPOT')
      const where = this.moveRange(src)
      if (where) return where

      if (this.pos.isNearTo(src)) {
        spot = this.pos
      } else {
        const spots = _.shuffle(src.spots)
        for (const s of spots) {
          spot = s
          const creeps = this.room.lookForAt(LOOK_CREEPS, s)
          if (!creeps.length) break
        }
      }
      this.memory.task.spot = spot
    }

    const where = this.movePos({pos: spot})
    const err = this.harvest(src)
    if (err === OK) {
      this.intents.melee = src
      this.dlog('harvest', where, err, src.energy)
      return src.energy
    }
    this.dlog('err', where, err)
    return where
  }

  taskCampSrcs () {
    const src = _.min(
      this.room.find(FIND_SOURCES),
      s => (s.ticksToRegeneration || 0) + s.energy)
    return this.taskCampSrc(src)
  }

  taskCampSrc (src) {
    if (this.carry.energy) return false

    src = this.checkId('camp src', src)
    if (src.energy) return false

    return this.moveNear(src)
  }
}
