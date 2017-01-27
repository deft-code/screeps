
Creep.prototype.actionRecharge = function(lack, pos) {
  const energies = this.room.cachedFind(FIND_DROPPED_ENERGY);
  const labs = [];  // this.room.Structures(STRUCTURE_LAB);
  const links = this.room.Structures(STRUCTURE_LINK);
  let chargers = _.filter(labs.concat(links), s => s.energy);
  let stores = this.room.Structures(STRUCTURE_CONTAINER);
  if (this.room.storage) {
    stores.push(this.room.storage);
  }
  stores = _.filter(stores, s => s.store.energy);

  let dest = pos;
  if (!dest) {
    dest = this.pos;
  }

  let anyE = [];
  let goodE = [];
  _.each(energies.concat(chargers).concat(stores), obj => {
    const avail = (obj.store && obj.store[RESOURCE_ENERGY]) || obj.energy;
    if (avail < lack) {
      anyE.push(obj);
    } else {
      goodE.push(obj);
    }
  });
  let e = dest.findClosestByRange(goodE);
  if (!e) {
    e = dest.findClosestByRange(anyE);
  }
  if (!e) {
    this.dlog('recharge fail');
    return false;
  }

  this.dlog('recharge from', e);

  switch (e.structureType) {
    case STRUCTURE_CONTAINER:
    case STRUCTURE_TERMINAL:
    case STRUCTURE_STORAGE:
      return this.actionUnstore(e, RESOURCE_ENERGY);
    case STRUCTURE_LINK:
    case STRUCTURE_LAB:
      return this.actionUncharge(e);
    default:
      return this.actionPickup(e);
  }
};

Creep.prototype.actionPoolCharge = function() {
  const room = Game.rooms[this.memory.home] || this.room;
  this.dlog('POOL ChARGE', room.energyAvailable, room.energyCapacityAvailable);
  if (room.energyAvailable >= room.energyCapacityAvailable) {
    return false;
  }
  const pools = _.filter(
      room.cachedFind(FIND_MY_SPAWNS)
          .concat(room.Structures(STRUCTURE_EXTENSION)),
      s => s.energy < s.energyCapacity);
  const pool = this.pos.findClosestByRange(pools);
  return this.actionCharge(pool);
};

Creep.prototype.actionTowerCharge = function() {
  const room = Game.rooms[this.memory.home] || this.room;
  let tower = _(room.Structures(STRUCTURE_TOWER))
                  .filter(s => s.energyCapacity - s.energy > s.energy)
                  .sample();
  return this.actionCharge(tower);
};

Creep.prototype.actionChargeAny = function() {
  const room = Game.rooms[this.memory.home] || this.room;

  let need =
      _(room.Structures(STRUCTURE_LAB).concat(room.Structures(STRUCTURE_TOWER)))
          .filter(s => s.energyCapacity - s.energy > 100)
          .sample();
  return this.actionCharge(need);
};

Creep.prototype.actionCharge = function(battery) {
  this.dlog('action charge', battery);
  if (!battery) {
    return false;
  }
  this.memory.task = {
    task: 'charge',
    charge: battery.id,
    note: battery.note,
  };
  this.say(battery.note);
  return this.taskCharge();
};

Creep.prototype.taskCharge = function() {
  this.dlog('taskCharge');
  let dest = Game.getObjectById(this.memory.task.charge);
  if (!dest) {
    return false;
  }
  const eNeed = dest.energyCapacity - dest.energy;
  if (eNeed <= 0) {
    return false;
  }
  if (this.carryTotal > this.carry.energy) {
    return this.actionMineralStore();
  }
  const lack = eNeed - this.carry.energy;
  if (lack > 0 && this.carryFree) {
    return this.actionRecharge(lack, dest.pos);
  }
  if (!this.carry.energy) {
    return false;
  }

  const what = modutil.sprint('charge', dest);
  let err = this.transfer(dest, RESOURCE_ENERGY);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(dest);
  }
  if (err == OK) {
    delete this.memory.task;
    if (dest.structureType == STRUCTURE_EXTENSION) {
      let exts = _.filter(
          this.room.Structures(STRUCTURE_EXTENSION),
          s => s.energyCapacity > s.energy && s.id != dest.id);
      let ext = this.pos.findClosestByPath(exts);
      if (ext) {
        this.memory.task = {
          task: 'charge',
          charge: ext.id,
        };
        return 'again';
      }
    }
    return 'success';
  }
  return false;
};



const creepNeedsCharge = (creep) => creep.carryFree > creep.carry.energy &&
    creep.memory.task && creep.memory.task.double == false;

Creep.prototype.actionChargeCreep = function(creep) {
  if (!creep) {
    creep = _(this.room.cachedFind(FIND_MY_CREEPS))
                .filter(creepNeedsCharge)
                .sample();
  }
  if (!creep) {
    return false;
  }
  this.memory.task = {
    task: 'charge creep',
    creep: creep.name,
    note: creep.name,
  };
  return this.taskChargeCreep();
};

Creep.prototype.taskChargeCreep = function() {
  const creep = this.taskCreep;
  if (!creep || !creepNeedsCharge(creep)) {
    return false;
  }
  const err = this.transfer(creep, RESOURCE_ENERGY);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(creep);
  }
  if (err == OK) {
    return 'success';
  }
  return false;
};

Creep.prototype.actionDischarge = function() {
  let structures =
      []; /*_.filter(
this.room.Structures(STRUCTURE_LAB).concat(this.room.Structures(STRUCTURE_TOWER)),
s => s.energyCapacity > s.energy);*/
  let workers = _.filter(
      this.room.roleCreeps('worker'),
      w => w.carryFree > w.carry.energy && w.memory.task &&
          w.memory.task.double == false);
  let recv = _.sample(structures.concat(workers));
  if (!recv) {
    return false;
  }
  this.memory.task = {
    task: 'discharge',
    discharge: recv.id,
    note: recv.note || recv.name,
  };
  return this.taskDischarge();
};

Creep.prototype.taskDischarge = function() {
  if (!this.carry.energy) {
    return false;
  }
  let recv = Game.getObjectById(this.memory.task.discharge);
  if (!recv) {
    return false;
  }
  let err = this.transfer(recv, RESOURCE_ENERGY);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(recv);
  }
  if (err == OK) {
    return 'success';
  }
  return false;

};


Creep.prototype.actionDrain = function() {
  if (!this.carryFree) {
    return false;
  }
  let resources = this.room.cachedFind(FIND_DROPPED_RESOURCES);

  let stores = _.filter(
      this.room.Structures(STRUCTURE_CONTAINER),
      s => s.storeTotal && s.memory.bucket);

  let links =
      _.filter(this.room.Structures(STRUCTURE_LINK), l => !l.memory.bucket);

  let srcs = resources.concat(stores).concat(links);
  let src = _.sample(srcs);
  if (!src) {
    return false;
  }

  switch (src.structureType) {
    case STRUCTURE_CONTAINER:
      return this.actionUnstore(src);
    case STRUCTURE_LINK:
      return this.actionUncharge(src);
    default:
      return this.actionPickup(src);
  }
};

Creep.prototype.actionUnstoreAny = function() {
  const store = _.sample(this.room.Structures(STRUCTURE_CONTAINER));
  return this.actionUnstore(store);
};

Creep.prototype.actionUnstore = function(struct, resource) {
  if(!struct) {
    return false;
  }
  this.memory.task = {
    task: 'unstore',
    unstore: struct.id,
    resource: resource,
    note: struct.note,
  };
  return this.taskUnstore();
};

Creep.prototype.taskUnstore = function() {
  let src = Game.getObjectById(this.memory.task.unstore);
  if (!src) {
    return false;
  }
  let resource = this.memory.task.resource || _.sample(Object.keys(src.store));
  const what = modutil.sprint('unstore', src);
  let err = this.withdraw(src, resource);
  if (err == ERR_NOT_IN_RANGE) {
    this.road(this.moveTo(src));
    return modutil.sprint('moveTo', what);
  }
  if (err == OK) {
    delete this.memory.task;
    return what;
  }
  return false;
};

Creep.prototype.actionStoreAny = function(room) {
  room = room || this.room;
  let stores = _.filter(
      room.Structures(STRUCTURE_CONTAINER),
      s => !s.memory.bucket && s.storeCapacity > s.storeTotal);
  if (room.storage) {
    stores.push(room.storage);
  }
  return this.actionStoreOne(stores);
};

Creep.prototype.actionMineralStore = function() {
  if (this.carryTotal == this.carry.energy) {
    return false;
  }
  return this.actionStoreOne([this.room.terminal]);
};

Creep.prototype.actionStoreOne = function(stores, resource) {
  return this.actionStore(_.sample(stores), resource);
};

Creep.prototype.actionStoreResource = function(resource) {
  let dest = _(this.room.Structures(STRUCTURE_LAB))
                 .filter(s => s.memory.prefer == resource)
                 .sample();
  if (!dest && this.room.terminal && this.room.terminal.storeFree) {
    dest = this.room.terminal;
  }

  if (!dest && this.room.storage && this.room.storeFree) {
    dest = this.room.storage
  }
  return this.actionStore(dest, resource);
};

Creep.prototype.actionStore = function(store, resource) {
  if (!store) {
    return false;
  }

  this.memory.task = {
    task: 'store',
    id: store.id,
    resource: resource,
    note: store.note,
  };
  return this.taskStore();

};

Creep.prototype.taskStore = function() {
  let store = this.taskId;
  if (!store || !this.carryTotal || !store.storeFree) {
    return false;
  }
  let resource = this.memory.task.resource || _.sample(Object.keys(this.carry));
  let err = this.transfer(store, resource);
  const what = modutil.sprint('store', err, resource, store);

  if (err == ERR_NOT_IN_RANGE) {
    this.road(this.moveTo(store));
    return what;
  }
  return err == OK && what;
};

Creep.prototype.actionEmptyStore = function() {
  if (!this.carry.energy) {
    return false;
  }
  const conts = _.filter(
      this.room.Structures(STRUCTURE_CONTAINER), s => !s.memory.bucket);
  if (this.room.storage) {
    conts.push(this.room.storage);
  }
  const store = _(conts).filter(s => !s.store.energy && s.storeFree).sample();
  if (!store) {
    return false;
  }
  this.memory.task = {
    task: 'store',
    store: store.id,
    resource: RESOURCE_ENERGY,
    note: store.note,
  };
  this.say(this.memory.task.note);
  return this.taskStore();
};

Creep.prototype.roleHauler = function() {
  return this.idleNom() || this.actionTask() || this.taskGoHome() ||
      this.actionPoolCharge() || this.actionTowerCharge() ||
      this.actionDrain() || this.actionEmptyStore() ||
      this.actionChargeCreep() || this.actionChargeAny() ||
      this.actionStoreAny();
};

StructureSpawn.prototype.newHauler = function() {
  return this.createRole(
      [
        MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, MOVE, CARRY,
        CARRY, MOVE, CARRY, CARRY, MOVE, CARRY, CARRY
      ],
      2, {role: 'hauler'});

};

function newHauler(room) {
  const spawn = _.sample(room.cachedFind(FIND_MY_SPAWNS));
  if (!spawn) {
    console.log('NO Spawn for hauler');
    return false;
  }
  return spawn.createRole(
      [
        MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, MOVE, CARRY,
        CARRY, MOVE, CARRY, CARRY, MOVE, CARRY, CARRY
      ],
      2, {role: 'hauler'});
}

module.exports.upkeep = function(room) {
  const nhaulers = room.roleCreeps('hauler').length;
  if (room.energyAvailable < room.energyCapacityAvailable && nhaulers) {
    return false;
  }
  return nhaulers < 3 && newHauler;
};
