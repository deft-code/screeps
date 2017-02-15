const util = require('util');

Flag.prototype.teamFarm = function() {
  const delta = this.memory.attacked - Game.time;
  this.attacked = delta? delta: 0;
  this.dlog("attack delta:", this.memory.attacked, delta, this.attacked);
  if(!this.attacked) {
    if(this.room && this.room.hostiles.length) {
      this.memory.attacked = Game.time + this.room.hostiles[0].ticksToLive;
    } else {
      delete this.memory.attacked;
    }
  }

  const nguard = this.attacked? 1: 0;
  let nfarmer = 1;
  let canReserve = false;
  if(this.room) {
    const nsrcs = this.room.find(FIND_SOURCES).length;
    nfarmer = nsrcs;
    const controller = this.room.controller;
    const claimed = controller && controller.owner && !controller.my;
    canReserve = !this.attacked && controller && !claimed &&
      controller.resTicks < 4000 && this.memory.spawnDist.min < 2;
    if(canReserve) {
      nfarmer++;
    }
  }

  this.dlog(`farmers: ${nfarmer}, reservers: ${canReserve}, guards: ${nguard}`);

  return this.upkeepRole("guard", 1,  700, 2, 2) ||
    this.upkeepRole("farmer", nfarmer,  700, 1, 2) ||
    canReserve && this.upkeepRole("reserver", 1,  1300, 1, 2) ||
    "enough";
};

Flag.prototype.roleGuard = function(spawn) {
  let body = [
      MOVE, TOUGH, MOVE, TOUGH,
      MOVE, RANGED_ATTACK, MOVE, HEAL,
      MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
  ];
  return this.createRole(spawn, body, {role: 'guard'});
};
  
Flag.prototype.roleFarmer = function(spawn) {
  let body = [
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'farmer'});
};

Flag.prototype.roleReserver = function(spawn) {
  let body = [MOVE, MOVE, CLAIM, CLAIM, MOVE, CLAIM];
  return this.createRole(spawn, body, {role: 'reserver'});
};
  
Creep.prototype.roleReserver = function() {
  return this.actionTask() ||
      this.actionTravelFlag(this.team) ||
      this.actionReserve(this.team.room);
};

Creep.prototype.roleFarmer = function() {
  this.idleNom();
  return this.actionHospital() ||
      this.actionTask() ||
      !this.carryTotal && this.actionTravelFlag(this.team) ||
      this.actionRoadUpkeep(this.team.room) ||
      this.actionFarm(this.team.room) ||
      this.carryTotal && this.actionTravel(this.home.controller) ||
      this.actionXferNearest(this.home);
};

Creep.prototype.actionRoadUpkeep = function(room) {
    if(!room) return false;

    return this.actionRepairStruct(STRUCTURE_ROAD, room) ||
        this.actionBuildStruct(STRUCTURE_ROAD, room) ||
        this.actionBuildRoom(room);
};

Creep.prototype.actionFarm = function(room) {
  if(!room) return false;

  if(!this.carryFree) return false;
    
  let resources = _.filter(
    room.find(FIND_DROPPED_RESOURCES),
    r => r.resourceType != RESOURCE_ENERGY || r.amount > 20);
  
  let stores = _.filter(
      room.find(FIND_STRUCTURES),
      s => s.storeTotal);

  const target = _.sample(resources.concat(stores));
  if(target) {
    if(target.structureType) {
      return this.actionUnstore(target);
    } else {
      return this.actionPickup(target);
    }
  }
  
  return this.actionHarvestAny(room);
};

Creep.prototype.actionXferNearest = function(room) {
    if(!room) return false;

    let stores = room.findStructs(STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL);
    stores = _.filter(stores, s => s.storeFree > this.carryTotal);

    const store = util.pickClosest(this.pos, stores);
    this.dlog("closest store", store);
    
    const batteries = _.filter(
        room.findStructs(STRUCTURE_LAB, STRUCTURE_TOWER, STRUCTURE_LINK),
        b => b.energyFree > this.carryTotal);
        
    const battery = util.pickClosest(this.pos, batteries);
    
    if(store) {
        if(battery && this.pos.getRangeTo(battery) < this.pos.getRangeTo(store)) {
            return this.actionXferEnergy(battery);
        }
        return this.actionXferStore(store);
    }
    return this.actionXferEnergy(battery);
};

Creep.prototype.actionXferStore = function(store) {
    this.dlog("xfer store", store);
    if(!store) return false;

    this.memory.task = {
        task: "xfer store",
        id: store.id,
        note: store.note,
    };
    return this.taskXferEnergy();
};

Creep.prototype.taskXferStore = function() {
    const store = this.taskId;
    if(!store || !store.storeFree || !this.carryTotal) {
        return false;
    }
    const resource = util.randomResource(this.carry);
    return this.doTransfer(store, resource) && resource;
};

Creep.prototype.actionXferEnergy = function(battery) {
    this.dlog("xfer energy", battery);
    if(!battery) return false;

    this.memory.task = {
        task: "xfer energy",
        id: battery.id,
        note: battery.note,
    };
    return this.taskXferEnergy();
};

Creep.prototype.taskXferEnergy = function() {
    const battery = this.taskId;
    if(!battery || !battery.energyFree || !this.carry.energy) {
        return false;
    }
    return this.doTransfer(battery, RESOURCE_ENERGY) && "success";
};
