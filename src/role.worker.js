const shed = require('shed');

module.exports = class CreepWorker {
  roleWorker() {
    let what = this.idleEmergencyUpgrade() || this.taskTask();
    if (what) return what;

    const upgrade = !this.room.storage || this.room.storage.store.energy > 10000;

    if (this.carry.energy) {
      return this.taskTurtleMode() ||
        (this.roleIndex() === 0 && this.taskRepairOrdered()) ||
        this.taskBuildOrdered() ||
        this.taskRepairOrdered() ||
        this.taskTurtlePrep() ||
        this.taskTurtle();
        //upgrade && this.goUpgradeController(this.room.controller);
    }
    return this.taskRechargeHarvest();
  }

  afterWorker() {
    if(shed.med()) return;

    this.idleNom();
    this.idleRecharge();
    if(this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair() || this.idleUpgrade();
    }
  }
};
