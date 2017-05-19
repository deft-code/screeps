module.exports = class CreepBootstrap {
  roleBootstrap() {
    let what = this.idleEmergencyUpgrade() || this.taskTask();
    if(what) return what;

    if (!this.atTeam) {
      return this.taskMoveFlag(this.team);
    }

    if(!this.carry.energy) {
      what = this.taskRechargeHarvest();
      if(what) return what;
    }

    return this.taskTransferTowers(100) ||
        this.taskTransferPool() || this.taskBuildOrdered() ||
        this.taskRepairOrdered() || this.taskUpgradeRoom() ||
        this.taskCampSrcs();
  }

  taskRechargeHarvest() {
      return this.taskRechargeLimit(this.carryFree/3) ||
        this.taskHarvestSpots() ||
        this.taskRechargeLimit(1);
  }

  afterBootstrap() {
    if(this.atTeam) {
      this.idleNom();
      this.idleRecharge();
    } else if (this.carryTotal) {
      this.drop(RESOURCE_ENERGY);
      this.say('Dump!');
    }

    if(this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair() || this.idleUpgrade();
    }
  }
};
