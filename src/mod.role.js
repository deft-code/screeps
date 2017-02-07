let modutil = require('util');

Creep.prototype.run = function() {
  let what = this.actionSpawning() || this.actionRole();
  this.dlog(what);
};

Creep.prototype.actionChase = function(creep) {
    if(this.pos.inRangeTo(creep, 3)) {
        this.move(this.pos.getDirectionTo(creep));
        return "nudge";
    }
    return this.actionMoveTo(creep);
};

Creep.prototype.idleRetreat = function(part) {
    if(this.getActiveBodyparts(part)) {
        return false;
    }
    return this.idleMoveTo(this.home.controller);
};

Creep.prototype.idleTravel = function(obj) {
  if(!obj) return;

  if(this.pos.roomName === obj.pos.roomName && !this.pos.exit) {
      return false;
  }
  return this.idleMoveTo(obj);
};

Creep.prototype.idleMoveNear = function(obj) {
  if(!obj || this.pos.isNearTo(obj)) return false;

  return this.idleMoveTo(obj);
};

Creep.prototype.idleMoveTo = function(obj) {
  const err = this.moveTo(obj);
  if(err == OK) {
      const path = Room.deserializePath(this.memory._move.path);
      this.room.visual.poly(path);
      return `moveTo ${obj.pos}`;
  }
  return false;
};

Creep.prototype.actionTravel = function(obj) {
    if(!obj) {
        return false;
    }
    this.memory.task = {
        task: 'travel',
        id: obj.id,
        note: obj.pos.roomName,
    };
    return this.taskTravel();
}

Creep.prototype.taskTravel = function() {
    const obj = this.taskId;
    if(!obj) {
        return false;
    }
    if(this.pos.roomName === obj.pos.roomName && !this.pos.exit) {
        return false;
    }
    return this.actionMoveTo(obj);
}

Creep.prototype.actionTravelFlag = function(flag) {
  if (!flag) {
    return false;
  }
  this.memory.task = {
    task: 'travel flag',
    flag: flag.name,
    note: flag.note,
  };
  return this.taskTravelFlag();
};

Creep.prototype.taskTravelFlag = function() {
  const flag = this.taskFlag;
  if (!flag || this.pos.roomName === flag.pos.roomName && !this.pos.exit) {
    return false;
  }
  return this.actionMoveTo(flag);
};

Creep.prototype.actionMoveFlag = function(dest) {
  if (!dest) {
    return false;
  }
  this.memory.task = {
    task: 'move flag',
    flag: dest.name,
    note: `flag:${dest.name}`,
  };
  return this.taskMoveFlag();
};

Creep.prototype.taskMoveFlag = function() {
  const flag = this.taskFlag;
  if (!flag || this.pos.isNearTo(flag)) {
    return false;
  }
  return this.actionMoveTo(flag);
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
    return this.actionMoveTo(creep);
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
    return this.actionMoveTo(room.controller);
  }
  if (err == OK) {
    return 'reserved';
  }
  this.say(modutil.sprint('bad reserve', err));
  return false;
};

Creep.prototype.actionHospital = function() {
  if ((this.hurts > 100 || this.hits < 100) &&
      !this.pos.inRangeTo(this.home.controller, 5)) {
    return this.actionMoveTo(this.home.controller);
  }
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
    return this.actionMoveTo(spawn);
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
