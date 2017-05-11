let lib = require('lib');

module.exports = class CreepWorker {
  roleWorker() {
    let what = this.idleEmergencyUpgrade() || this.taskTask();
    if (what) return what;

    if (this.carry.energy) {
      return this.taskBuildOrdered() || this.taskRepairOrdered() ||
          this.goUpgradeController(this.room.controller);
    }
    return this.taskRecharge() || this.taskHarvestAny();
  }

  afterWorker() {
    this.idleNom();
    this.idleRecharge();
    this.idleBuild() || this.idleRepair();
    if(this.carryTotal < this.carryFree) {
      this.idleUpgrade();
    }
  }
};

//lib.merge(Creep, CreepWorker);
