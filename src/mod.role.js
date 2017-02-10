let modutil = require('util');

Creep.prototype.run = function() {
  modutil.markDebug(this);
  this.intents = {};
  let what = this.actionSpawning() || this.actionRole();
  this.dlog(what);
};

Creep.prototype.actionReplaceOldest = function(creeps) {
    let min = this;
    for(let creep of creeps) {
        if(creep.ticksToLive < min.ticksToLive) {
            min = creep;
        }
    }
    return this.actionReplace(min);
}

Creep.prototype.actionReplace = function(creep) {
    if(!creep || creep.name === this.name) {
        return false;
    }
    this.memory.task = {
        task: "replace",
        creep: creep.name,
    };
    return this.taskReplace();
}

Creep.prototype.taskReplace = function() {
    const creep = this.taskCreep;
    if(!creep) {
        return false;
    }
    if(this.pos.isNearTo(creep)) {
        this.memory.task = creep.memory.task;
        delete creep.memory.task;
        creep.actionRecycle();
        return this.actionTask();
    }
    return this.idleMoveTo(creep);
}

Creep.prototype.actionSpawning = function() {
  if (!this.memory.home) {
    this.memory.home = this.room.name;
  }
  return this.spawning && 'Spawning';
};

Creep.prototype.actionRole = function() {
  let role = _.camelCase('role ' + this.memory.role);
  let roleFunc = this[role] || this.roleUndefined;
  return roleFunc.apply(this);
};

Creep.prototype.roleUndefined = function() {
  this.dlog('Missing Role!');
};

Creep.prototype.actionTask = function() {
  let task = this.memory.task;
  if (!task) {
    return false;
  }
  let taskFunc = this[_.camelCase('task ' + task.task)];
  if (!taskFunc) {
    console.log('BAD TASK', JSON.stringify(task));
    return false;
  }
  let what = taskFunc.apply(this);
  if (!what || what == 'success') {
    delete this.memory.task;
  }
  return what;
};

Creep.prototype.actionReserve = function(room) {
  if (!room) {
    return false;
  }
  const err = this.reserveController(room.controller);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(room.controller);
  }
  if (err == OK) {
    return 'reserved';
  }
  this.say(modutil.sprint('bad reserve', err));
  return false;
};

Creep.prototype.roleRanged = function() {
  const enemies = this.room.find(FIND_HOSTILE_CREEPS);
  if (enemies.length) {
    const enemy = this.pos.findClosestByRange(enemies);
    const err = this.rangedAttack(enemy);
    if (err == ERR_NOT_IN_RANGE) {
      // Don't build roads for wandering fighters.
      this.moveTo(enemy);
      return 'Pursue ' + enemy.id.slice(-4);
    }
    return 'Attacked ' + enemy.id.slice(-4);
  }
  const spawn =
      _.sample(this.room.Structures(STRUCTURE_SPAWN)) || Game.spawns.Third;
  const err = spawn.recycleCreep(this);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(spawn);
  }
  return false;
};

let roleRanged = function(creep) {
  return creep.roleRanged();
};

Creep.prototype.actionRecycle = function() {
  this.memory.task = {
    task: 'recycle',
    id: this.memory.spawn.id,
  };
  return this.taskRecycle();
};

Creep.prototype.taskRecycle = function() {
  let spawn = this.taskId;
  if (!spawn) {
    return false;
  }
  let err = spawn.recycleCreep(this);
  if (err == ERR_NOT_IN_RANGE) {
    this.moveTo(spawn);
    return 'moveTo recycle';
  }
  return err == OK && 'recycled';
};

Creep.prototype.roleRecycle = function() {
  return this.actionTask() || this.actionRecycle();
};
