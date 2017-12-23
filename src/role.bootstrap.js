module.exports = class CreepBootstrap {
  roleBootstrap() {
    this.dlog('enter bootstrap');
    let what = this.idleEmergencyUpgrade() || this.taskTask();
    if(what) return what;

    this.dlog('bootstrap retask');

    if (!this.atTeam) {
      return this.taskMoveFlag(this.team);
    }

    if(!this.carry.energy) {
      what = this.taskRechargeHarvest();
      if(what) return what;
    }

    if(this.room.controller.level < 2) {
      this.dlog("controller override");
      return this.taskUpgradeRoom();
    }

    return this.taskTransferTowers(100) ||
        this.room.assaulters.length && this.taskTransferTowers(400) ||
        this.taskTransferPool() ||
        this.taskBuildStructs(STRUCTURE_TOWER) ||
        this.taskTurtleMode() ||
        this.taskBuildOrdered() ||
        this.taskRepairOrdered() ||
        this.taskUpgradeRoom() ||
        this.taskCampSrcs();
  }

  taskRechargeHarvest() {
    // Don't drain Srcs if we're under attack
    if(this.room.memory.thostiles && _.any(this.room.findStructs(STRUCTURE_TOWER), 'energyFree')) {
      return this.taskRechargeLimit(1) ||
        this.taskHarvestSpots();
    }
    return this.taskRechargeLimit(this.carryFree/3) ||
      this.taskHarvestSpots() ||
      this.taskRechargeLimit(1);
  }

  afterBootstrap() {
    if(this.atTeam) {
      this.idleNom();
      this.idleRecharge();
      this.idleTransferExtra();
    } else if (this.carryTotal) {
      this.drop(RESOURCE_ENERGY);
      this.say('Dump!');
    }


    if(this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair() || this.idleUpgrade();
    }
  }
};

function towersFull(room) {
  _.any(this.findStructs(STRUCTURE_TOWER), 'energyFree');
  for(const tower of this.findStructs(STRUCTURE_TOWER)) {
    if(tower.energyFree) return false;
  }
  return 
}
