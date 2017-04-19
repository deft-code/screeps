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
    if (what) return what;

    if (this.carry.energy) {
      return this.taskBuildOrdered() || this.taskRepairOrdered() ||
          this.goUpgrade();
    }
    return this.taskRecharge() || this.taskHarvestAny();
  }

  afterWorker() {
    this.idleNom();
    this.idleRecharge();
  }
}

lib.merge(Creep, CreepWorker);
