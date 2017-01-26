
const modutil = require('util');

Creep.prototype.roleClaim = function() {
  let f = Game.flags.claim;
  if (!f) {
    return false;
  }
  if (this.pos.roomName == f.pos.roomName) {
    const err = this.claimController(this.room.controller);
    if (err == ERR_NOT_IN_RANGE) {
      return this.actionMoveTo(this.room.controller);
    }
  }
  return this.actionMoveTo(f);
};

StructureSpawn.prototype.roleClaim = function() {
  const body = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
  return this.createRole(body, 2, {role: 'claim'});
};

Creep.prototype.actionTravel = function(dest) {
  if (!dest || dest.pos.roomName == this.pos.roomName) {
    return false;
  }
  this.memory.task = {
    task: 'travel',
    travel: dest.name,
    note: dest.note,
  };
  return this.taskTravel();
};

Creep.prototype.taskTravel = function() {
  const dest = Game.flags[this.memory.task.travel];
  if (!dest || this.pos.isNearTo(dest)) {
    return false;
  }
  return this.actionMoveTo(dest);
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
    return this.actionMoveTo(src);
  }
  if (err == OK) {
    return src.energy || 'success';
  }
  return false;
};

Creep.prototype.actionRbuild = function() {
  const sites = this.room.cachedFind(FIND_MY_CONSTRUCTION_SITES);
  const site = this.pos.findClosestByRange(sites);
  if (!site) {
    return false;
  }
  this.memory.task = {
    task: 'rbuild',
    rbuild: site.id,
    note: 'site' + site.pos.x + site.pos.y,
  };
  return this.taskRbuild();
};

Creep.prototype.taskRbuild = function() {
  const site = Game.getObjectById(this.memory.task.rbuild);
  if (!site) {
    return false;
  }
  let err = this.build(site);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(site);
  }
  if (err == OK) {
    return 'building';
  }
  return false;
};

Creep.prototype.actionUpgrade2 = function() {
  this.memory.task = {
    task: 'upgrade2',
  };
  return this.taskUpgrade2();
};

Creep.prototype.taskUpgrade2 = function() {
  if (!this.carry.energy) {
    return false;
  }
  const err = this.upgradeController(this.room.controller);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(this.room.controller);
  }
  if (err == OK) {
    return this.room.controller.progress;
  }
  return false;
};

Creep.prototype.roleRemoteBuild = function() {
  return this.idleNom() || this.actionTask() ||
      this.actionTravel(Game.flags.claim) || this.actionBuildFinish() ||
      this.actionUpgrade() || this.actionHarvestAny();
};

Creep.prototype.roleMedic = function() {
  return this.actionTask() || this.actionLocalHeal();
};

StructureSpawn.prototype.newMedic = function() {
  return this.createCreep([HEAL, MOVE], undefined, {role: 'medic'});
};

Creep.prototype.actionLocalHeal = function() {
  const heal = _(this.room.cachedFind(FIND_MY_CREEPS))
                   .filter(c => c.hits < c.hitsMax)
                   .sample();
  if (!heal) {
    return false;
  }
  this.say(heal.name);
  this.memory.task = {
    task: 'local heal',
    creep: heal.name,
  };
  return this.taskLocalHeal();
};

Creep.prototype.taskLocalHeal = function() {
  const c = Game.creeps[this.memory.task.creep];
  if (!c || c.pos.roomName != this.pos.roomName || c.hits == c.hitsMax) {
    return false;
  }
  const err = this.heal(c);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(c);
  }
  if (err == OK) {
    this.move(this.pos.getDirectionTo(c));
    return c.hits;
  }
  return false;

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
