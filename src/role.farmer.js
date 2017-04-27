const lib = require('lib');

Flag.prototype.roleFarmer = function(spawn) {
  let body = [
    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,

    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,

    MOVE, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'farmer'});
};

class CreepFarmer {
  roleFarmer() {
    const what = this.idleRetreat(CARRY) || this.taskTask();
    if(what) return what;

    if(this.atHome) {
      if(this.carryTotal) {
        return this.taskTransferResources() || this.taskBuildOrdered() || this.taskRepairOrdered() ||
          this.goUpgradeController(this.room.controller);
      }
      return this.taskMoveFlag(this.team);
    }

    return this.taskRoadUpkeep() || this.taskFarm() || this.taskMoveRoom(this.home.controller);
  }

  afterFarmer() {
      this.idleNom();
  }

  taskFarm() {
    if (!this.carryFree) return false;

    return this.taskCollect() || this.taskHarvestAny();
  }
}

lib.merge(Creep, CreepFarmer);
