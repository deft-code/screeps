const modutil = require('util');

Creep.prototype.taskGoHome = function() {
  const home = Game.rooms[this.memory.home];
  if (!home || this.pos.roomName == home.name) {
    return false;
  }
  return this.idleMoveTo(home.controller);
};

Creep.prototype.idleNom = function() {
  if (!this.carryFree) {
    return false;
  }
  const src = _(this.room.find(FIND_DROPPED_ENERGY))
                  .filter(e => e.pos.isNearTo(this))
                  .sample();
  if (src) {
    const err = this.pickup(src);
    if (err == OK) {
      this.say('Nom');
    } else {
      this.dlog('BAD Nom', err);
    }
  }
  return false;
};

Creep.prototype.actionPickup = function(resource, amount) {
  if (!this.carryFree) {
    return false;
  }
  resource = resource || RESOURCE_ENERGY;
  amount = amount || 0;
  if (_.isString(resource)) {
    resources = this.room.find(FIND_DROPPED_RESOURCES);
    const rtype = resource;
    resource = _(this.room.find(FIND_DROPPED_RESOURCES))
                   .filter(r => r.resourceType == rtype && r.amount > amount)
                   .sample();
  }
  this.memory.task = {
    task: 'pickup',
    pickup: resource.id,
  };
  return this.taskPickup();
};

Creep.prototype.taskPickup = function() {
  let resource = Game.getObjectById(this.memory.task.pickup);
  if (!resource || !this.carryFree) {
    return false;
  }
  let err = this.pickup(resource);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(resource);
  }
  if (err == OK) {
    return 'success';
  }
  return false;
};

Creep.prototype.actionWithdraw = function(structure, resource, amount) {
  amount = amount || 0;
  if (!structure) {
    let structures = this.room.findStructs(STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL);
    if (resource) {
      structure =
          _(structures).filter(s => s.store[resource] > amount).sample();
    } else {
      structure = _(structures).filter(s => s.storeTotal > amount).sample();
    }
  }
  if (!resource) {
    resource = modutil.randomResource(structure.store);
  }
  this.memory.task = {
    task: 'withdraw',
    withdraw: structure.id,
    note: structure.note,
    resource: resource,
  };
  return this.taskWithdrawResource();
};

Creep.prototype.taskWithdraw = function() {
  const store = Game.getObjectById(this.memory.task.withdraw);
  if (!store || !store.store[this.memory.task.resource] || !this.carryFree) {
    return false;
  }
  let err = this.withdraw(store, resource);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(store);
  }
  if (err == OK) {
    delete this.memory.task;
    return 'success';
  }
  return false;
};

Creep.prototype.actionUncharge = function(structure, amount) {
  amount = amount || 0;
  if (!structure) {
    const structures = this.room.findStructs(STRUCTURE_LINK, STRUCTURE_LAB);
    structure = _(structures).filter(s => s.energy > amount).sample();
  }
  this.memory.task = {
    task: 'uncharge',
    uncharge: structure.id,
    note: structure.note,
  };
  return this.taskUncharge();
};

Creep.prototype.taskUncharge = function() {
  let src = Game.getObjectById(this.memory.task.uncharge);
  if (!src || !this.carryFree || !src.energy) {
    return false;
  }
  let err = this.withdraw(src, RESOURCE_ENERGY);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(src);
  }
  if (err == OK) {
    delete this.memory.task;
    return 'success';
  }
  return false;
};


function goodLabTransfer(creep, lab, resource) {
  if (!lab) {
    return false;
  }
  return lab.mineralType == lab.memory.prefer &&
      lab.mineralCapacity > lab.mineralAmount && creep.store[lab.memory.prefer];
}

Creep.prototype.actionTransfer = function(resource, dest) {
  rtype = resource || modutil.randomResource(this.carry);
  if (!dest) {
    dest = _(this.room.findStructs(STRUCTURE_LAB))
               .filter(l => goodLabTransfer(this, lab, rtype))
               .sample();
    return this.actionTransferLab(dest);
  }
  if (!dest && this.room.terminal && this.room.terminal.storeFree > 100000) {
    dest = this.room.terminal;
  }
  if (!dest && this.room.storage) {
    dest = this.room.storage;
  }
};

Creep.prototype.actionTransferLab = function(lab) {
  this.memory.task = {
    task: 'transfer lab',
    lab: lab.id,
    note: lab.note,
  };
  return this.taskTransferLab();
};

Creep.prototype.taskTransferLab = function() {
  const lab = Game.getObjectById(this.memory.task.lab);
  if (!goodTransferLab(this, lab, this.memory.task.resource)) {
    return false;
  }
  const err = this.transfer(lab, lab.memory.prefer);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(lab);
  }
  if (err == OK) {
    delete this.memory.task;
    return 'success';
  }
  return false;
};

// Only start to double time once long running work is succeeding.
Creep.prototype.actionDoubleTime = function() {
  if (!this.memory.task || this.memory.task.double != undefined) {
    return false;
  }

  const links = this.room.findStructs(STRUCTURE_LINK);
  for (var i = 0; i < links.length; i++) {
    if (links[i].pos.isNearTo(this)) {
      this.memory.task.double = links[i].id;
      return this.taskDoubleTime();
    }
  }

  const stores = this.room.findStructs(STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL);
  for (var i = 0; i < stores.length; i++) {
    if (stores[i].store.energy && stores[i].pos.isNearTo(this)) {
      this.memory.task.double = stores[i].id;
      return this.taskDoubleTime();
    }
  }

  this.memory.task.double = false;
  return false;
};

// Always return false so double time doesn't stop other tasks.
Creep.prototype.taskDoubleTime = function() {
  if (!this.memory.task || !this.memory.task.double) {
    return false;
  }
  const double = Game.getObjectById(this.memory.task.double);
  if (!double) {
    delete this.memory.task.double;
    return false;
  }
  const err = this.withdraw(double, RESOURCE_ENERGY);
  if (err != OK && err != ERR_NOT_ENOUGH_ENERGY &&
      err != ERR_NOT_ENOUGH_RESOURCES) {
    delete this.memory.task.double;
    return false;
  }
  return false;
};


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
