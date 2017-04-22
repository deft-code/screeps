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

Creep.prototype.roleBootstrap = function() {
  const what = this.taskTask();
  if(what) return what;

  if (!this.atTeam) {
    if (this.carryTotal) {
      this.drop(RESOURCE_ENERGY);
      this.say('Dump!');
    }
    return this.taskTravelFlag(this.team);
  }

  if (!this.teamRoom) return false;

  return this.taskTransferTowers(100) ||
      this.taskTransferPool() || this.taskBuildOrdered() ||
      this.taskRepairOrdered() || this.taskUpgradeRoom() ||
      this.taskHarvestAny();
};
