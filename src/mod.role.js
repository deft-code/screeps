let modutil = require('util');

Creep.prototype.run = function() {
  let what = this.actionSpawning() || this.actionRole();
  this.dlog(what);
};

Creep.prototype.actionTravelFlag = function(flag) {
  this.dlog("travel flag", flag);
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
  this.dlog("taskTravelFlag");
  if (!flag || this.pos.roomName === flag.pos.roomName) {
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

var actionHarvest = function(creep) {
  if (creep.memory.harvesting && creep.carry.energy == creep.carryCapacity) {
    delete creep.memory.harvesting;
    return false;
  }

  if (!creep.memory.harvesting && creep.carry.energy > 0) {
    return false;
  }

  if (!creep.memory.harvesting) {
    var srcs = creep.room.find(FIND_SOURCES);
    if (srcs.length) {
      var src = creep.pos.findClosestByPath(srcs);
      if (!src) {
        console.log('Failed to path to', srcs.length, 'sources');
        return false;
      }
      creep.memory.harvesting = src.id;
    }
  }
  var src = Game.getObjectById(creep.memory.harvesting);
  var e = creep.harvest(src);
  if (e == ERR_NOT_IN_RANGE || e == ERR_NOT_ENOUGH_RESOURCES) {
    creep.road(creep.moveTo(src));
    return 'moveTo harvest ' + modutil.who(src);
  }
  if (e != 0) {
    delete creep.memory.harvesting;
    return false;
  }
  return 'harvest ' + who(src);
};

var actionGraze = function(creep) {
  if (creep.carry.energy < creep.carryCapacity) {
    let near = _.sample(creep.pos.findInRange(FIND_DROPPED_ENERGY, 1));
    if (near) {
      creep.pickup(near);
      return 'grazed';
    }
  }
  return false;
};


var actionPickup = function(creep) {
  if (actionGraze(creep)) {
    return false;
  }
  if (creep.carry.energy > 0) {
    delete creep.memory.picking;
    return false;
  }

  return actionForcePickup(creep);
};

var findEnergy = function(creep) {
  var srcs = creep.room.find(FIND_DROPPED_ENERGY);
  var src = creep.pos.findClosestByPath(srcs);
  if (src) {
    creep.memory.picking = src.id;
  }
};

var actionForcePickup = function(creep) {
  if (!creep.memory.picking) {
    findEnergy(creep);
  }
  var src = Game.getObjectById(creep.memory.picking);
  var e = creep.pickup(src);
  if (e == ERR_NOT_IN_RANGE) {
    creep.road(creep.moveTo(src));
    return 'moveTo force pickup';
  }
  delete creep.memory.picking;
  if (e == ERR_INVALID_TARGET) {
    findEnergy(creep);
    return false;
  }
  return 'picked up';
};

var actionHaulerRecharge = function(creep) {
  var targets = creep.room.find(FIND_MY_STRUCTURES, {
    filter: s => (s.structureType == STRUCTURE_SPAWN ||
                  s.structureType == STRUCTURE_EXTENSION) &&
        needEnergy(s)
  });
  if (targets.length) {
    return actionRecharge2(creep, true);
  }
  return actionRecharge2(creep, false);
};

var rechargeAtLeast = function(creep, amount, withdraw) {
  let es = _.filter(creep.room.droppedEnergy, e => e.energy > amount);
  // return es;

  let chargers = creep.room.find(
      FIND_STRUCTURES,
      {filter: s => s.charger && s.store[RESOURCE_ENERGY] > amount});

  let links =
      _.filter(creep.room.Structures(STRUCTURE_LINK), s => s.energy > amount);

  let first = es.concat(chargers).concat(links);

  if (!withdraw) {
    return first;
  }
  let cs = creep.room.find(FIND_STRUCTURES, {
    filter: s => s.structureType == STRUCTURE_CONTAINER &&
        s.store[RESOURCE_ENERGY] > amount
  });
  if (creep.room.storage &&
      creep.room.storage.store[RESOURCE_ENERGY] > amount) {
    cs.push(creep.room.storage);
  }
  if (creep.room.terminal &&
      creep.room.terminal.store[RESOURCE_ENERGY] > amount) {
    cs.push(creep.room.terminal);
  }
  return first.concat(cs);
};

var actionRecharge2 = function(creep, withdraw) {
  if (creep.carry.energy > 0) {
    if (creep.carry.energy < creep.carryCapacity) {
      // Grazing
      let energy = _.sample(creep.pos.findInRange(FIND_DROPPED_ENERGY, 1));
      if (energy) {
        let err = creep.pickup(energy);
        if (err == OK) {
          creep.say('Nom Nom');
        }
      }
    }
    delete creep.memory.recharge;
    return false;
  }
  if (!creep.memory.recharge) {
    let need = creep.carryCapacity - creep.carry.energy;
    let best = rechargeAtLeast(creep, need, withdraw);
    let e = creep.pos.findClosestByPath(best);
    if (!e) {
      let all = rechargeAtLeast(creep, 0, withdraw);
      e = creep.pos.findClosestByPath(all);
    }
    if (!e) {
      return 'Can\'t Recharge';
    }
    creep.memory.recharge = e.id;
    creep.say(e.structureType || e.resourceType);
  }

  let recharge = Game.getObjectById(creep.memory.recharge);
  if (!recharge) {
    delete creep.memory.recharge;
    return false;
  }
  if (recharge.structureType == STRUCTURE_CONTAINER ||
      recharge.structureType == STRUCTURE_STORAGE ||
      recharge.structureType == STRUCTURE_LINK ||
      recharge.structureType == STRUCTURE_TERMINAL) {
    let err = creep.withdraw(recharge, RESOURCE_ENERGY);
    if (err == ERR_NOT_IN_RANGE) {
      creep.road(creep.moveTo(recharge));
      return 'moveTo recharge from ' + modutil.who(recharge);
    }
    delete creep.memory.recharge;
    // Don't pickup causes withdraw to fail.
    creep.cancelOrder('pickup');
    return 'recharged from cont';
  }

  let err = creep.pickup(recharge);
  if (err == ERR_NOT_IN_RANGE) {
    creep.road(creep.moveTo(recharge));
    return 'moveTo recharge pickup';
  }
  if (err == OK) {
    return 'recharge pickup';
  }
  // bad pickup
  console.log('bad recharge pickup', creep.memory.recharge, err);
  delete creep.memory.recharge;
  creep.say('Bad recharge pickup');
  return false;
};

var actionWithdraw = function(creep) {
  if (creep.memory.withdrawing && creep.carry.energy == creep.carryCapacity) {
    delete creep.memory.withdrawing;
    return false;
  }

  if (!creep.memory.withdrawing && creep.carry.energy > 0) {
    return false;
  }

  if (!creep.memory.withdrawing) {
    var srcs = creep.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType == STRUCTURE_CONTAINER && s.store.energy > 0
    });
    if (srcs && srcs.length) {
      var src = creep.pos.findClosestByRange(srcs);
      creep.memory.withdrawing = src.id;
    }
  }
  var src = Game.getObjectById(creep.memory.withdrawing);
  var e = creep.withdraw(src, RESOURCE_ENERGY);
  if (e == ERR_NOT_IN_RANGE) {
    creep.road(creep.moveTo(src));
    return 'moveTo withdraw ' + modutil.who(src);
  }
  if (e != 0) {
    delete creep.memory.withdrawing;
    return false;
  }
  return 'withdraw ' + modutil.who(src);
};

let actionStore = function(creep, amount) {
  let stores = creep.room.find(
      FIND_STRUCTURES,
      {filter: s => s.store && _.sum(s.store) < s.storeCapacity && !s.charger});
  if (creep.room.storage) {
    stores.push(creep.room.storage);
  }
  const store = creep.pos.findClosestByPath(stores);
  if (store) {
    let err = creep.transfer(store, RESOURCE_ENERGY, amount);
    if (err == ERR_NOT_IN_RANGE) {
      creep.road(creep.moveTo(store));
      return 'moveTo store ' + modutil.who(store);
    }
    return 'store ' + modutil.who(store);
  }
  return false;
};

let actionStoreMineral = function(creep) {
  for (let k in creep.carry) {
    if (k != RESOURCE_ENERGY) {
      let err = creep.transfer(creep.room.terminal, k);
      if (err == ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.terminal);
      }
      return 'minerals!'
    }
  }
  return false;
};

var needEnergy = function(structure) {
  if (structure.structureType == STRUCTURE_SPAWN ||
      structure.structureType == STRUCTURE_TOWER) {
    return structure.energyCapacity - structure.energy > 40
  }
  if (structure.structureType == STRUCTURE_LINK) {
    return false;
  }
  if (structure.source) {
    return false;
  }
  return structure.energy < structure.energyCapacity
};

let actionTransfer = function(creep) {
  if (!creep.memory.transfer) {
    if (!creep.room.needTransfer) {
            let transferring = _(Game.creeps)
                .map(c=>c.memory.transfer)
                .compact()
                .reduce((h,k)=> {
                    h[k] = true
                    return h
                }, {});
                    creep.room.needTransfer = creep.room.find(
                        FIND_MY_STRUCTURES,
                        {filter: s => !transferring[s.id] && needEnergy(s)});
    }
    if (!creep.room.needTransfer.length) {
      // console.log(creep.name, "Nothing needs transfer");
      return false;
    }
    let target = creep.pos.findClosestByPath(creep.room.needTransfer);
    if (!target) {
      console.log('Bad transfer pick from', creep.room.needTransfer);
      return false;
    }
    creep.room.needTransfer = _.without(creep.room.needTransfer, target);
    creep.memory.transfer = target.id;
  }
  let target = Game.getObjectById(creep.memory.transfer);
  let e = creep.transfer(target, RESOURCE_ENERGY);
  if (e == ERR_NOT_IN_RANGE) {
    creep.road(creep.moveTo(target));
    return 'moveTo transfer';
  }
  delete creep.memory.transfer;
  if (e == OK) {
    return 'transferred ' + modutil.who(target);
  }
  return false;
};

var actionTransferTower = function(creep) {
  var targets = creep.room.find(FIND_STRUCTURES, {
    filter: s => s.structureType == STRUCTURE_TOWER &&
        s.energy * 2 < s.energyCapacity
  });
  if (targets.length) {
    console.log('Spawn Recharge Tower', creep.name);
    var target = creep.pos.findClosestByPath(targets);
    var e = creep.transfer(target, RESOURCE_ENERGY);
    if (e == ERR_NOT_IN_RANGE) {
      creep.road(creep.moveTo(target));
    }
    return 'transfer tower';
  }
  return false;
};


var actionUpgrade = function(creep) {
  if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
    creep.road(creep.moveTo(creep.room.controller));
    return 'moveTo upgrade'
  }
  return 'upgrade';
};

var actionEmergencyUpgrade = function(creep) {
  if (creep.room.controller.ticksToDowngrade < 3000) {
    return actionUpgrade(creep);
  }
  return false;
};

var actionRecharge = function(creep) {
  return actionRecharge2(creep, true) || actionWithdraw(creep) ||
      actionPickup(creep) || actionHarvest(creep);
};


var actionUpgrade = function(creep) {
  if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
    creep.road(creep.moveTo(creep.room.controller));
  }
  return 'upgrade';
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
