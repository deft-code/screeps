Flag.prototype.teamClaim = function() {
  this.dlog("my creeps", this.creeps.length, this.creeps);
  const hurt = _.any(this.creeps, "hurts");
  return this.upkeepRole("remote build", 2, 2000) ||
    hurt && this.upkeepRole("medic", 1, 1000);
};

Flag.prototype.roleRemoteBuild = function(spawn) {
  const body = [
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'remote build'});
};
