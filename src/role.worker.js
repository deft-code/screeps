let lib = require('lib');

Flag.prototype.roleWorker = function(spawn) {
  const body = [
    CARRY, WORK, MOVE, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
    CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
    WORK,  MOVE, WORK, MOVE,  WORK, MOVE, WORK,  MOVE, WORK, MOVE,
  ];
  return this.createRole(spawn, body, {role: 'worker'});
};

class CreepWorker {
  roleWorker() {
    let what = this.actionTask();
    if(what) return what;

    if(this.carry.energy) {
      return this.taskBuildOrdered() ||
        this.taskRepairOrdered() ||
        this.goUpgrade();
    }


    const what = 
  return this.taskDoubleTime() || this.actionTask() ||
      this.actionStoreResource() ||
      this.taskBuildOrdered() ||
      this.taskRepairOrdered() || this.taskUpgrade() || this.taskHarvestAny();
  }

  afterWorker() {
    this.idleNom();
    this.idleRecharge();
  }
}

Creep.prototype.roleWorker = function() {
  this.idleNom();
  return this.taskDoubleTime() || this.actionTask() ||
      this.actionStoreResource() ||
      this.taskBuildOrdered() ||
      this.taskRepairOrdered() || this.taskUpgrade() || this.taskHarvestAny();
};

Creep.prototype.actionEmergencyUpgrade = function() {
  const room = Game.rooms[this.memory.home] || this.room;
  if (room.controller.ticksToDowngrade < 3000) {
    return actionUpgrade(creep);
  }
  return false;
};

