const lib = require('lib');

class CreepClaim {
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
    if (err == OK) {
      return this.room.controller.resTicks;
    }
    if (err == ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(room.controller);
    }
    this.say(modutil.sprint('bad reserve', err));
    return false;
  }

  goUpgradeController(controller, move = true) {
    const err = this.upgradeController(controller);
    if (err === OK) {
      this.intents.upgrade = controller;
      return controller.progress
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveRange(controller);
    }
    return false;
  }
}

lib.merge(Creep, CreepClaim);

class CreepHarvest {
  taskHarvestAny() {
    if (!this.atTeam) return false;
    return this.taskHarvest(this.pickSrc());
  }

  taskHarvest(src) {
    if (!this.carryFree) return false;
    src = this.checkId('harvest', src);
    return this.goHarvest(src);
  }

  pickSrc() {
    let srcs = _.filter(
        this.room.find(FIND_SOURCES),
        src => src.energy || this.pos.inRangeTo(src, src.ticksToRegeneration));
    if (!srcs.length) {
      srcs = this.room.find(FIND_SOURCES);
    }
    if (srcs.length === 1) return _.first(srcs);

    let min = 100;
    let minSrc = null;
    let range = 100;
    for (let src of srcs) {
      const spots = this.room.lookForAtRange(LOOK_CREEPS, src.pos, 1, true);
      let l = spots.length;
      // Don't count self.
      if (_.find(spots, spot => spot.creep.name === this.name)) {
        l -= 1;
      }
      const r = this.pos.getRangeTo(src);
      if (l < min || l === min && r < range) {
        min = spots.length;
        minSrc = src;
        range = r;
      }
    }
    return minSrc;
  }

  goHarvest(src, move = true) {
    const err = this.harvest(src);
    if (err === OK) {
      this.intents.melee = src;
      return src.energy;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(src);
    }
    return false;
  }
}

lib.merge(Creep, CreepHarvest);
