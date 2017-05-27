module.exports = class CreepUpgrader {
  roleUpgrader() {
    const what = this.goUpgradeController(this.team.room.controller);

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
        if(!this.goWithdraw(struct, RESOURCE_ENERGY, false)) {
          delete this.memory.struct;
        }
      }
      return what;
    }

    return this.moveRange(this.team.room.controller);
  }

  afterUpgrader() {
    if(this.pos.inRangeTo(this.room.controller, 4)) {
      this.idleNom();
    }
    if(this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair();
    }
  }
};
