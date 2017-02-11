Flag.prototype.teamBase = function() {
  this.debug = true;
  this.dlog("my creeps", this.creeps.length, this.creeps);

  const srcers = this.roleCreeps("srcer");
  if(!srcers.length){
    const where = this.upkeepRole("srcer", 1, 300, 4);
    if(where) return where;
  }

  const haulers = this.roleCreeps("hauler");
  if(!haulers.length){
    const where = this.upkeepRole("hauler", 1, 300, 4);
    if(where) return where;
  }

  return this.upkeepRole("srcer", 2, Math.min(this.room.energyCapacity, 750), 3) ||
    this.upkeepRole("hauler", 2, this.room.energyCapacity / 3, 3) ||
    "enough";
};

Flag.prototype.roleSrcer = function(spawn) {
  let body = [MOVE, WORK, WORK, WORK, WORK, CARRY, WORK, WORK, MOVE, MOVE];
  return this.createRole(spawn, body, {role: "srcer"});
};

Flag.prototype.roleHauler = function(spawn) {
  const cap = this.room.energyCapacityAvailable;
  const n = Math.floor(cap/100) * 3;
  const body = [
    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,
    
    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,
    
    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,
    
    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,

    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,

    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,
  ];
 return this.createRole(spawn, body.slice(0, n), {role: 'hauler'});
};
