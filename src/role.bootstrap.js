const lib = require('lib');

Flag.prototype.roleBootstrap = function(spawn) {
  const body = [
    MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK,
    MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK,
    MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK,
    MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK,
    MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK,
  ];
  return this.createRole(spawn, body, {role: 'bootstrap'});
};

class CreepBootstrap {
  roleBootstrap() {
    let what = this.idleEmergencyUpgrade() || this.taskTask();
    if(what) return what;

    if (!this.atTeam) {
      if (this.carryTotal) {
        this.drop(RESOURCE_ENERGY);
        this.say('Dump!');
      }
      return this.taskMoveFlag(this.team);
    }

    if(!this.carry.energy) {
      what = this.taskRecharge() || this.taskHarvestAny();
      if(what) return what;
    }

    return this.taskTransferTowers(100) ||
        this.taskTransferPool() || this.taskBuildOrdered() ||
        this.taskRepairOrdered() || this.taskUpgradeRoom() ||
        this.taskHarvestNext();
  }

  afterBootstrap() {
    this.idleNom();
  }
}

lib.merge(Creep, CreepBootstrap);
