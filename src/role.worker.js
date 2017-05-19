module.exports = class CreepWorker {
  roleWorker() {
    let what = this.idleEmergencyUpgrade() || this.taskTask();
    if (what) return what;

    const upgrade = !this.room.storage || this.room.storage.store.energy > 10000;

    if (this.carry.energy) {
      return this.taskTurtleMode() ||
        this.taskBuildOrdered() ||
        this.taskRepairOrdered() ||
        upgrade && this.goUpgradeController(this.room.controller);
    }
    return this.taskRechargeHarvest();
  }

  taskTurtleMode() {
    if(this.room.memory.tassaulters) {
      return this.taskTurtle();
    }
    return false;
  }

  taskTurtle() {
    let walls = this.room.findStructs(STRUCTURE_WALL, STRUCTURE_RAMPART);
    let wall = _.first(_.sortBy(walls, 'hits'));
    return this.taskRepair(wall);
  }

  afterWorker() {
    this.idleNom();
    this.idleRecharge();
    if(this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair();
      this.idleUpgrade();
    }
  }
};
