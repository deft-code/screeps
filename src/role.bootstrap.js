Flag.prototype.roleBootstrap = function(spawn) {
  const body = [
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'remote build'});
};

Creep.prototype.roleBootstrap = function() {
  if(!this.atTeam) {
    if(this.carryTotal) {
      this.drop(RESOURCE_ENERGY);
      this.say("Dump!");
    }
    return this.taskTravelFlag(this.team);
  }

  this.idleNom();
  const room = this.team && this.team.room;
  if(!room) return false;

  return this.actionTask() ||
      this.actionBuildRoom(this.team.room) ||
      this.actionUpgrade(this.team.room) ||
      this.taskHarvestAny(this.team.room)
};
