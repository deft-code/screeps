const modsquads = require('squads');

class RobSquad extends modsquads.Squad {
  constructor(name) {
    super(name);
  }

  execute() {
    if (!this.spawn) {
      return 'no spawn';
    }
    const room = this.spawn.room;
    if (this.spawn.spawning) {
      return 'spawning';
    }
    if (room.energyAvailable < room.energyCapacityAvailable) {
      return 'need energy';
    }
    return this.upkeepRole("thief", 1);
  }

  roleThief() {
    let body = [
      MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,
      CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY,
    ];
    let min = 6;
    if(this.memory.aggressive) {
      min = 10;
      body = [MOVE, TOUGH, MOVE, TOUGH, MOVE, ATTACK, MOVE, ATTACK].concat(body);
    }
    const who = this.createRole(body, min, {role: 'thief'});
    return this.trackCreep(this.memory.thieves, who);
  }
};

modsquads.Squad.register(RobSquad);

StructureSpawn.prototype.newRobSquad = function(flagname) {
  const name = flagname
  const mem = {
    thieves: [],
  };
  return this.newSquad(flagname, RobSquad, mem);
};

Creep.prototype.roleThief = function() {
  this.notifyWhenAttacked(!this.squad.memory.aggressive);
  this.idleNom();
  return this.actionHospital() ||
      this.actionTask() ||
      this.actionThief();
};

Creep.prototype.actionThief = function() {
  const flag = this.squad.flag;
  if (!flag) {
    return false;
  }
  const hostile = _.find(this.room.hostiles, h => this.pos.isNearTo(h));
  if(hostile) {
      this.attack(hostile);
  }
  if (this.pos.roomName == this.squad.home.name) {
    if (this.carryTotal) {
      return this.actionXferNearest(this.squad.home);
    } else {
      return this.actionTravelFlag(flag);
    }
  } else {
    if (this.carryTotal) {
      return this.actionMoveTo(this.squad.spawn);
    } else {
      return this.actionTravelFlag(flag) || this.actionUnstoreAny();
    }
  }
  return false;
};
