const util = require('util');

Flag.prototype.roleHauler = function(spawn) {
  const cap = this.room.energyCapacityAvailable;
  const n = Math.floor(cap / 100) * 3;
  const body = [
    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,

    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,

    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,

    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,

    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,

    MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,
  ];
  return this.createRole(spawn, body.slice(0, n), {role: 'hauler'});
};

Creep.prototype.actionRecharge = function(lack, pos) {
  let room = this.team.room;
  if (pos) {
    room = Game.rooms[pos.roomName];
  }
  if (!room) return false;

  const energies = room.find(FIND_DROPPED_RESOURCES);
  let chargers =
      _.filter(room.findStructs(STRUCTURE_LINK, STRUCTURE_LAB), 'energy');
  let stores = _.filter(
      room.findStructs(STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL), 'store.energy');

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
  this.dlog('goodE', goodE);
  let e = util.pickClosest(dest, goodE);
  if (!e) {
    e = util.pickClosest(dest, anyE);
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
  const room = this.team.room;
  if (!room) return false;

  if (room.energyAvailable >= room.energyCapacityAvailable) {
    return false;
  }

  const pools = _.filter(
      room.findStructs(STRUCTURE_SPAWN, STRUCTURE_EXTENSION),
      s => s.energyFree);
  return this.actionCharge(util.pickClosest(this.pos, pools));
};

Creep.prototype.actionTowerCharge = function() {
  this.dlog('actionTowerCharge');
  const room = this.team.room;
  if (!room) return false;

  const towers =
      _.filter(room.findStructs(STRUCTURE_TOWER), s => s.energy < 100);
  return this.actionCharge(util.pickClosest(this.pos, towers));
};

Creep.prototype.actionChargeAny = function() {
  const room = this.team.room;
  if (!room) return false;

  let need =
      //_(room.findStructs(STRUCTURE_LAB, STRUCTURE_TOWER))
      _(room.findStructs(STRUCTURE_TOWER))
          .filter(s => s.energyFree > 100)
          .sample();
  return this.actionCharge(need);
};

Creep.prototype.actionCharge = function(battery) {
  this.dlog('action charge', battery);
  if (!battery) return false;

  this.memory.task = {
    task: 'charge',
    id: battery.id,
    note: battery.note,
  };
  this.say(battery.note);
  return this.taskCharge();
};

Creep.prototype.taskCharge = function() {
  this.dlog('taskCharge');
  let dest = this.taskId;
  if (!dest) return false;

  if (!dest.energyFree) return false;

  if (this.carryTotal > this.carry.energy) {
    return this.actionStoreResource();
  }

  const lack = Math.min(this.carryFree, dest.energyFree - this.carry.energy);
  this.dlog('charge lacking', lack);
  if (lack >= 50 && this.carry.energy < 50 || !this.carry.energy) {
    return this.actionRecharge(lack, dest.pos);
  }

  this.dlog('charge energy', this.carry.energy);
  if (!this.carry.energy) return false;

  return this.doTransfer(dest, RESOURCE_ENERGY);
};

const creepNeedsCharge = (creep) => creep.carryFree > creep.carry.energy &&
    creep.memory.task && creep.memory.task.double == false;

Creep.prototype.actionChargeCreep = function(creep) {
  if (!creep) {
    const room = this.team.room;
    if (!room) return false;

    creep = _(room.find(FIND_MY_CREEPS)).filter(creepNeedsCharge).sample();
  }
  if (!creep) return false;

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
  return this.doTransfer(creep, RESOURCE_ENERGY);
};

Creep.prototype.actionDischarge = function() {
  const room = this.team.room;
  if (!room) return false;

  let structures = [];
  let workers = _.filter(
      this.room.roleCreeps('worker'),
      w => w.carryFree > w.carry.energy && w.memory.task &&
          w.memory.task.double == false);
  let recv = _.sample(structures.concat(workers));
  if (!recv) return false;

  this.memory.task = {
    task: 'discharge',
    id: recv.id,
    note: recv.note || recv.name,
  };
  return this.taskDischarge();
};

Creep.prototype.taskDischarge = function() {
  const target = this.taskId;
  if (!target) return false;

  if (!this.carry.energy) return false;

  return this.doTransfer(target, RESOURCE_ENERGY);
};

Creep.prototype.actionDrain = function() {
  const room = this.team.room;
  if (!room) return false;
  if (!this.carryFree) return false;

  let resources = room.find(FIND_DROPPED_RESOURCES);

  let stores = _.filter(
      room.findStructs(STRUCTURE_CONTAINER),
      s => s.storeTotal && s.mode === 'src');

  let links = _.filter(
      room.findStructs(STRUCTURE_LINK),
      l => l.mode() === 'src' && l.energyFree < 30);

  let srcs = resources.concat(stores).concat(links);
  if (room.terminal &&
      room.terminal.store.energy * 2 > room.terminal.storeCapacity) {
    srcs.push(room.terminal);
  }

  let src = _.sample(srcs);
  if (!src) {
    return false;
  }

  switch (src.structureType) {
    case STRUCTURE_TERMINAL:
    case STRUCTURE_CONTAINER:
      return this.actionUnstore(src, RESOURCE_ENERGY);
    case STRUCTURE_LINK:
      return this.actionUncharge(src);
    default:
      return this.actionPickup(src);
  }
};

Creep.prototype.actionUnstoreAny = function() {
  const room = this.team.room;
  if (!room) return false;

  const store = _.sample(room.findStructs(STRUCTURE_CONTAINER));
  return this.actionUnstore(store);
};

Creep.prototype.actionUnstore = function(struct, resource) {
  this.dlog('action unstore', ...arguments);
  if (!struct) return false;

  this.memory.task = {
    task: 'unstore',
    id: struct.id,
    resource: resource,
    note: struct.note,
  };
  return this.taskUnstore();
};

Creep.prototype.taskUnstore = function() {
  let src = this.taskId;
  if (!src || !src.storeTotal || !this.carryFree) {
    return false;
  }
  const resource = this.memory.task.resource || util.randomResource(src.store);
  this.dlog('task unstore', src, resource);
  return this.doWithdraw(src, resource);
};

Creep.prototype.actionStoreAny = function() {
  const room = this.team.room;
  if (!room) return false;

  let stores = _.filter(
      room.findStructs(STRUCTURE_CONTAINER),
      s => !s.mode() != 'src' && s.storeFree);
  if (room.storage && room.storage.storeFree) {
    stores.push(room.storage);
  }
  return this.actionStore(_.sample(stores));
};

Creep.prototype.actionEmptyStore = function() {
  const room = this.team.room;
  if (!room) return false;

  if (!this.carry.energy) {
    return false;
  }
  const stores =
      _.filter(room.findStructs(STRUCTURE_CONTAINER), s => s.mode() !== 'src');
  if (room.storage) {
    stores.push(room.storage);
  }
  const store = _(stores).filter(s => !s.store.energy && s.storeFree).sample();
  return this.actionStore(store);
};

Creep.prototype.actionStoreResource = function(resource) {
  const room = this.team.room;
  if (!room) return false;

  if (this.carryTotal <= this.carry.energy) return false;

  if (room.terminal && room.terminal.storeFree) {
    return this.actionStore(room.terminal);
  }

  if (room.storage && room.storeFree) {
    return this.actionStore(room.storage);
  }

  return this.actionStoreAny();
};

Creep.prototype.actionStore = function(store, resource) {
  if (!store) return false;

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
  let resource = this.memory.task.resource || util.randomResource(this.carry);
  return this.doTransfer(store, resource);
};

Creep.prototype.roleHauler = function() {
  this.idleNom();
  return this.actionTask() || this.actionTowerCharge() ||
      this.actionPoolCharge() || this.actionDrain() ||
      this.actionEmptyStore() || this.actionChargeCreep() ||
      this.actionChargeAny() || this.actionStoreAny() ||
      this.idleMoveNear(this.team);
};
