import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepRepair } from 'creep.repair';
import { LegacyRet } from 'Tasker';

// Upgrade, reserve and harvest-spot tasks of the 2017 roles (startup,
// worker, pioneer and the dead roles). First link of the legacy mixin
// chain: CreepWork -> CreepOldRepair -> CreepAttack -> CreepDismantle ->
// CreepHeal, which the role.*.ts classes extend for typing; every link is
// @injecter(Creep) so the methods land on Creep.prototype as the JS
// mixins did (lib.merge).

declare global {
  interface CreepTaskMem {
    // taskHarvest: the tile beside the source the creep harvests from.
    spot?: RoomPosition
  }
  interface CreepMemory {
    // Remembered targets of the legacy roles (role.*.ts), by id.
    src?: Id<Source>
    store?: Id<AnyStoreStructure>
    tower?: Id<StructureTower>
    link?: Id<StructureLink>
    repair?: Id<Structure>
    dismantle?: Id<Structure>
    // Rooms a hauling role returns to (role.trucker, role.farmer).
    drop?: string
    dropRoom?: string
    // Tick a harvester reached its spot (role.harvester).
    active?: number
  }
  interface Creep {
    idleEmergencyUpgrade(): LegacyRet
    idleUpgrade(): LegacyRet
    taskUpgradeRoom(): LegacyRet
    taskUpgrade(controller?: StructureController | null): LegacyRet
    taskReserveRoom(): LegacyRet
    taskReserve(controller?: StructureController | null): LegacyRet
    goUpgradeController(controller: StructureController | undefined | null, move?: boolean): LegacyRet
    idleHarvest(): LegacyRet
    taskHarvestSpots(): LegacyRet
    taskHarvest(src?: Source | null, spot?: RoomPosition): LegacyRet
    taskCampSrcs(): LegacyRet
    taskCampSrc(src?: Source | null): LegacyRet
  }
}

@injecter(Creep)
export class CreepWork extends CreepRepair {
  idleEmergencyUpgrade () {
    if (!this.store.energy) return false
    const controller = this.room.controller
    if (!controller || !controller.my) return false
    if (controller.level === 8 && controller.ticksToDowngrade > 2000) return false
    if (controller.progress < controller.progressTotal && controller.ticksToDowngrade > 2000) return false
    if (Game.shard.ptr && controller.ticksToDowngrade > 2000) return false

    return this.taskUpgradeRoom()
  }

  idleUpgrade () {
    if (!this.intents.canWork()) return false

    return this.goUpgradeController(this.room.controller, false)
  }

  taskUpgradeRoom () {
    return this.taskUpgrade(this.room.controller)
  }

  taskUpgrade (controller?: StructureController | null) {
    if (!this.store.energy) return false
    controller = this.checkId('upgrade', controller)
    if (!controller || !controller.my) return false
    return this.goUpgradeController(controller)
  }

  taskReserveRoom () {
    return this.taskReserve(this.room.controller)
  }

  taskReserve (controller?: StructureController | null) {
    controller = this.checkId('reserve', controller)
    if (!controller) return false

    let err = this.reserveController(controller)
    if (err === ERR_INVALID_TARGET) {
      err = this.attackController(controller);
    }
    if (err === OK) {
      return controller.resTicks || "attacked";
    }

    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(controller)
    }
    this.say(`bad reserve ${err}`)
    return false
  }

  goUpgradeController (controller: StructureController | undefined | null, move = true) {
    if (!controller) return false
    const err = this.upgradeController(controller)
    if (err === OK) {
      this.intents.setWork(controller)
      return controller.progress || 'MAX!'
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveRange(controller)
    }
    return false
  }

  idleHarvest () {
    if (!this.intents.canWork()) return false
    const srcs = this.room.find(FIND_SOURCES_ACTIVE)
    const src = _.find(srcs, s => this.pos.isNearTo(s))
    if (!src) return false
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
    return false
  }

  // `spot` is advisory only (as in the JS): the spot is picked below.
  taskHarvest (src?: Source | null, _spot?: RoomPosition) {
    if (!this.store.getFreeCapacity()) return false
    src = this.checkId('harvest', src)
    this.dlog('harvest', src)
    if (!src || !src.energy) return false

    const tmem = this.memory.task!
    let spot = lib.roomposFromMem(tmem.spot)
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
      tmem.spot = spot || undefined
    }

    // Bumped onto another tile that still touches the source: adopt it rather
    // than walking back and bumping whoever took the old spot (farmer churn).
    if (spot && !this.pos.isEqualTo(spot) && this.pos.isNearTo(src)) {
      this.dlog('harvest adopt spot', this.pos)
      spot = this.pos
      tmem.spot = spot
    }

    const where = spot ? this.movePos({pos: spot}) : false
    const err = this.harvest(src)
    if (err === OK) {
      this.intents.setWork(src)
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

  taskCampSrc (src?: Source | null) {
    if (this.store.energy) return false

    src = this.checkId('camp src', src)
    if (!src || src.energy) return false

    return this.moveNear(src)
  }
}
