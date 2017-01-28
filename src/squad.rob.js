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
    this.undertaker(this.memory.thieves);
    const nthieves = this.memory.nthieves || 1;
    if (this.memory.thieves.length < nthieves) {
      return this.roleThief();
    }
    return 'enough';
  }

  roleThief() {
    let body = [
      MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,
      CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY,
    ];
    let min = 6;
    if(this.memory.aggressive) {
      min = 10;
      body = [TOUGH, MOVE, ATTACK, MOVE].concat(body);
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
  this.idleNom();
  return this.actionHospital() ||
      this.actionTask() ||
      this.actionThief();
};

Creep.prototype.actionThief = function() {
  const flag = this.squad.flag;
  this.dlog("action theif", flag);
  if (!flag) {
    return false;
  }
  if (this.pos.roomName == this.home.name) {
    if (this.carryTotal) {
      return this.actionStoreAny();
    } else {
      return this.actionTravelFlag(flag);
    }
  } else {
    if (this.carryTotal) {
      return this.actionMoveTo(this.home.controller);
    } else {
      return this.actionTravelFlag(flag) || this.actionUnstoreAny();
    }
  }
  return false;
};
