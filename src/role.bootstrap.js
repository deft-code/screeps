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
  if (creep.atTeam) {
    if (creep.carryTotal < creep.carryFree) {
      this.after = () => this.say(this.slurp());
    }
  }

  if (!this.atTeam) {
    if (this.carryTotal) {
      this.drop(RESOURCE_ENERGY);
      this.say('Dump!');
    }
    return this.taskTravelFlag(this.team);
  }

  this.idleNom();
  if (!this.teamRoom) return false;

  return this.actionTask() || this.actionTowerCharge() ||
      this.actionPoolCharge() || this.taskBuildOrdered() ||
      this.taskRepairOrdered() || this.actionUpgrade(this.teamRoom) ||
      this.taskHarvestAny(this.teamRoom);
};
