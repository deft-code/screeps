module.exports = class CreepUpgrader {
  roleUpgrader() {
    const what = this.taskTask() ||
      this.taskBoostOne() ||
      this.goUpgradeController(this.team.room.controller);

    const struct = Game.getObjectById(this.memory.struct) ||
      _(this.room.lookForAtRange(LOOK_STRUCTURES, this.room.controller.pos, 4, true))
        .map(spot => spot[LOOK_STRUCTURES])
        .filter(s => s.structureType != STRUCTURE_TOWER)
        .find(s => s.energy || s.store && s.store.energy);

    if(struct) {
      this.memory.struct = struct.id;
      if(!this.intents.move && !this.fatigue) {
        this.moveNear(struct);
      }
      if(this.carryTotal < 2*this.info.upgradeController) {
        if(!this.taskWithdraw(struct, RESOURCE_ENERGY)) {
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
  }
};
