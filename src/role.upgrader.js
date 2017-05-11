const lib = require('lib');

class CreepUpgrader {
  roleUpgraderfunction() {
    this.goUpgradeController(this.team.room.controller);

    const struct = Game.getObjectById(this.memory.struct) ||
      _(this.room.lookForAtRange(LOOK_STRUCTURES, this.room.controller.pos, 4, true))
        .map(spot => spot[LOOK_STRUCTURES])
        .find(s => s.energy || s.store && s.store.energy);

    if(struct) {
      this.memory.struct = struct.id;
      if(!this.intents.move && !this.fatigue) {
        this.moveNear(struct);
      }
      if(this.carryTotal < this.carryFree) {
        if(!this.doWithdraw(struct, RESOURCE_ENERGY, false)) {
          delete this.memory.struct;
        }
      }
    }

    return what;
  }

  afterUpgrader() {
    if(this.pos.inRangeTo(this.room.controller, 4)) {
      this.idleNom();
    }
    if(this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair();
    }
  }
}

lib.merge(Creep, CreepUpgrader);
