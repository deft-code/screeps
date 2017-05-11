const lib = require('lib');

module.exports = class CreepWork {
  idleEmergencyUpgrade() {
    if(!this.carry.energy) return false;
    const controller = this.room.controller;
    if(!controller || !controller.my) return false;
    if(controller.ticksToDowngrade > 2000) return false;

    return this.goUpgradeController(controller);
  }

  idleUpgrade() {
    if(this.intents.upgrade) return false;

    return this.goUpgradeController(this.room.controller, false);
  }

  taskUpgradeRoom() {
    return this.taskUpgrade(this.room.controller);
  }

  taskUpgrade(controller) {
    if (!this.carry.energy) return false;
    controller = this.checkId('upgrade', controller);
    return this.goUpgradeController(controller);
  }

  taskReserveRoom() {
    return this.taskReserve(this.room.controller);
  }

  taskReserve(controller) {
    controller = this.checkId('reserve', controller);

    const err = this.reserveController(controller);
    if (err === OK) {
      return this.room.controller.resTicks;
    }
    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(this.room.controller);
    }
    this.say(`bad reserve ${err}`);
    return false;
  }

  goUpgradeController(controller, move = true) {
    const err = this.upgradeController(controller);
    if (err === OK) {
      this.intents.upgrade = controller;
      return controller.progress
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveRange(controller);
    }
    return false;
  }

  taskHarvestSpots() {
    for(const src of this.room.find(FIND_SOURCES_ACTIVE)) {
      if(!this.pos.isNearTo(src)) continue;
      return this.taskHarvestSpot(src, this.pos);
    }

    const srcs = _(this.room.find(FIND_SOURCES))
      .filter(s => s.energy || this.pos.getRangeTo(s) > s.ticksToRegeneration)
      .shuffle()
      .value();
    console.log("taskHarvestSpots", srcs.length, srcs);
    for(const src of srcs) {
      const spots = _.shuffle(src.spots);
      for(const spot of spots) {
        const creeps = this.room.lookForAt(LOOK_CREEPS, spot);
        if(creeps.length) continue;
        return this.taskHarvestSpot(src, spot);
      }
    }
  }

  taskHarvestSpot(src, spot) {
    if (!this.carryFree) return false;

    src = this.checkId('harvest spot', src);
    if(!src || !src.energy) return false;

    if(this.memory.task.spot) {
      spot = lib.roomposFromMem(this.memory.task.spot);
    } else {
      this.memory.task.spot = spot;
    }

    const where = this.movePos(spot);
    const err = this.harvest(src);
    if (err === OK) {
      this.intents.melee = src;
      return src.energy;
    }
    return where;
  }

  taskCampSrcs() {
    const src = _.min(
      this.room.find(FIND_SOURCES),
      s => s.ticksToRegeneration);
    return this.taskCampSrc(src);
  }

  taskCampSrc(src) {
    if(this.carry.energy) return false;

    src = this.checkId('camp src', src);
    if(src.energy) return false;

    return this.moveNear(src);
  }
}
