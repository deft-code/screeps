Flag.prototype.teamBase = function() {
  this.dlog("my creeps", this.creeps.length, this.creeps);

  const srcers = this.roleCreeps("srcer");
  if(!srcers.length){
    const where = this.upkeepRole("srcer", 1, 300, 4);
    if(where) return where;
  }

  return this.upkeepRole("srcer", 2, Math.min(this.room.energyCapacity, 750), 3);
};

Flag.prototype.roleSrcer = function(spawn) {
  let body = [MOVE, WORK, WORK, WORK, WORK, CARRY, WORK, WORK, MOVE, MOVE];
  return this.createRole(spawn, body, {role: "srcer"});
};
