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
  if (!this.atTeam) {
    if (this.carryTotal) {
      this.drop(RESOURCE_ENERGY);
      this.say('Dump!');
    }
    return this.taskTravelFlag(this.team);
  }

  this.idleNom();
  const room = this.team && this.team.room;
  if (!room) return false;

  return this.actionTask() || this.taskBuildOrdered() ||
      this.taskRepairOrdered() || this.actionUpgrade(this.team.room) ||
      this.taskHarvestAny(this.team.room);
};
