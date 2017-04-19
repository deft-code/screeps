const util = require('util');

Flag.prototype.teamFarm = function() {
  const delta = this.memory.attacked - Game.time;
  this.attacked = delta > 0 ? delta : 0;
  this.dlog('attack delta:', this.memory.attacked, delta, this.attacked);
  if (!this.attacked) {
    if (this.room && this.room.hostiles.length) {
      this.memory.attacked = Game.time + this.room.hostiles[0].ticksToLive;
    } else {
      delete this.memory.attacked;
    }
  }

  const nguard = this.attacked ? 1 : 0;
  let nfarmer = 1;
  let canReserve = false;
  if (this.room) {
    const nsrcs = this.room.find(FIND_SOURCES).length;
    nfarmer = nsrcs;
    const controller = this.room.controller;
    const claimed = controller && controller.owner && !controller.my;
    canReserve = !this.attacked && controller && !claimed &&
        controller.resTicks < 4000 &&
        (this.memory.spawnDist.min < 2 || nsrcs > 1);
    if (canReserve) {
      nfarmer++;
    }
  }

  this.dlog(`farmers: ${nfarmer}, reservers: ${canReserve}, guards: ${nguard}`);

  return this.upkeepRole('guard', nguard, 2, this.closeSpawn(800)) ||
      this.upkeepRole('miner', 1, 2, this.closeSpawn(950)) ||
      this.upkeepRole('farmer', nfarmer, 2, this.closeSpawn(800)) ||
      canReserve && this.upkeepRole('reserver', 1, 2, this.closeSpawn(1300)) ||
      'enough';
};

Flag.prototype.roleReserver = function(spawn) {
  let body = [MOVE, MOVE, CLAIM, CLAIM, MOVE, CLAIM];
  return this.createRole(spawn, body, {role: 'reserver'});
};

Creep.prototype.roleReserver = function() {
  return this.actionTask() || this.taskTravelFlag(this.team) ||
      this.actionReserve(this.team.room);
};

Creep.prototype.actionRoadUpkeep = function(room) {
  if (!room) return false;

  return this.taskRepairRoads() || this.taskBuildStructs(STRUCTURE_ROAD) ||
      this.taskBuildAny();
};

Creep.prototype.actionXferNearest = function(room) {
  if (!room) return false;

  let stores = room.findStructs(
      STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL);
  stores = _.filter(stores, s => s.storeFree * 2 > this.carryTotal);

  const store = util.pickClosest(this.pos, stores);
  this.dlog('closest store', store);

  const batteries = _.filter(
      room.findStructs(STRUCTURE_LAB, STRUCTURE_TOWER, STRUCTURE_LINK),
      b => b.energyFree * 2 > this.carryTotal);

  const battery = util.pickClosest(this.pos, batteries);

  if (store) {
    if (battery && this.pos.getRangeTo(battery) < this.pos.getRangeTo(store)) {
      return this.actionXferEnergy(battery);
    }
    return this.actionXferStore(store);
  }
  return this.actionXferEnergy(battery);
};

Creep.prototype.actionXferStore = function(store) {
  this.dlog('xfer store', store);
  if (!store) return false;

  this.memory.task = {
    task: 'xfer store',
    id: store.id,
    note: store.note,
  };
  return this.taskXferEnergy();
};

Creep.prototype.taskXferStore = function() {
  const store = this.taskId;
  if (!store || !store.storeFree || !this.carryTotal) {
    return false;
  }
  const resource = util.randomResource(this.carry);
  return this.goTransfer(store, resource) && resource;
};

Creep.prototype.actionXferEnergy = function(battery) {
  this.dlog('xfer energy', battery);
  if (!battery) return false;

  this.memory.task = {
    task: 'xfer energy',
    id: battery.id,
    note: battery.note,
  };
  return this.taskXferEnergy();
};

Creep.prototype.taskXferEnergy = function() {
  const battery = this.taskId;
  if (!battery || !battery.energyFree || !this.carry.energy) {
    return false;
  }
  return this.goTransfer(battery, RESOURCE_ENERGY);
};
