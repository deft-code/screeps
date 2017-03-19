Flag.prototype.teamBase = function() {

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

  let nworker = 1
  if(this.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
    nworker += 1
  }

  return this.upkeepRole("srcer", 2, Math.min(this.room.energyCapacityAvailable, 750), 3) ||
    this.upkeepRole("hauler", 2, this.room.energyCapacityAvailable / 3, 3) ||
    this.upkeepRole("worker", nworker, this.room.energyCapacityAvailable, 2) ||
    this.upkeepRole("upgrader", 1, this.room.energyCapacityAvailable, 2) ||
    "enough";
};

Flag.prototype.roleUpgrader = function(spawn) {
  const body = [
    MOVE, WORK, CARRY, WORK, CARRY, MOVE,

    MOVE, WORK, MOVE,  WORK, MOVE, WORK,

    MOVE, WORK, MOVE,  WORK, MOVE, WORK,

    MOVE, WORK, MOVE,  WORK, MOVE, WORK,
  ];
  return this.createRole(spawn, body, {role: 'upgrader'});
};
