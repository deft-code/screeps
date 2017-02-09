
const modutil = require('util');

Creep.prototype.roleClaim = function() {
  let f = Game.flags.claim;
  if (!f) {
    return false;
  }
  if (this.pos.roomName == f.pos.roomName) {
    const err = this.claimController(this.room.controller);
    if (err == ERR_NOT_IN_RANGE) {
      return this.idleMoveTo(this.room.controller);
    }
  }
  return this.idleMoveTo(f);
};

StructureSpawn.prototype.roleClaim = function() {
  const body = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
  return this.createRole(body, 2, {role: 'claim'});
};

Creep.prototype.actionHarvestAny = function(room) {
  room = room || this.room;
  const src = this.pos.findClosestByPath(room.cachedFind(FIND_SOURCES_ACTIVE));
  return this.actionHarvest(src);
};

Creep.prototype.actionHarvest = function(src) {
  if (!src) {
    return false;
  }
  this.memory.task = {
    task: 'harvest',
    id: src.id,
    note: 'src' + src.pos.x + src.pos.y,
  };
  this.say(this.memory.task.note);
  return this.taskHarvest();
};

Creep.prototype.taskHarvest = function() {
  if (!this.carryFree) {
    return false;
  }
  const src = this.taskId;
  if (!src || !src.energy) {
    return false;
  }
  let err = this.harvest(src);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(src);
  }
  if (err == OK) {
    return src.energy || 'success';
  }
  return false;
};

Creep.prototype.roleRemoteBuild = function() {
  if(this.room.name == this.team.pos.roomName) this.idleNom();

  return this.actionTask() ||
      this.actionTravelFlag(this.team) ||
      this.actionBuildRoom(this.team.room) ||
      this.actionUpgrade(this.team.room) ||
      this.actionHarvestAny(this.team.room) ||
      this.idleMoveNear(this.team);
};

Creep.prototype.roleRemoteHaul = function() {
  const load = Game.spawns.Fourth.room.storage;
  const unload = Game.flags.unload;
  if (this.pos.roomName == unload.pos.roomName) {
    if (this.hits < this.hitsMax) {
      return this.roleHauler();
    }
    if (this.ticksToLive < 200) {
      this.memory.role = 'hauler';
      return this.roleHauler();
    }
  }
  if (this.pos.roomName == load.pos.roomName) {
    if (this.ticksToLive < 200) {
      this.memory.role = 'recycle';
      return this.roleRecycle();
    }
  }
  if (this.carryFree) {
    const err = this.withdraw(load, RESOURCE_ENERGY);
    if (err == ERR_NOT_IN_RANGE) {
      this.moveTo(load);
    }
    return 'loading';
  }
  if (this.pos.isNearTo(unload)) {
    this.drop(RESOURCE_ENERGY);
    this.moveTo(load);
    return 'unloading';
  }

  this.moveTo(unload);
};

StructureSpawn.prototype.roleRemoteHaul = function() {
  const body = [
    // TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE,

    MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,
    CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY,

    MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,
    CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY,

    MOVE,  CARRY, MOVE,  CARRY
  ];
  return this.createRole(body, 2, {role: 'remote haul'});

};

StructureSpawn.prototype.roleRemoteBuild = function() {
  const body = [
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
  ];
  return this.createRole(body, 5, {role: 'remote build'});
};
