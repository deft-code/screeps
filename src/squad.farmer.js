const modsquads = require('squads');

class FarmSquad extends modsquads.Squad {
  constructor(name) {
    super(name);
  }

  execute() {
    if (!this.spawn) {
      return 'no spawn';
    }
    const room = this.spawn.room;
    if (this.spawn.spawning) {
      return 'spawning';
    }
    
    if(!this.attacked && this.farm && this.farm.hostiles.length) {
        this.memory.attacked = Game.time + this.farm.hostiles[0].ticksToLive;
    }
    
    const nguard = this.attacked? 1: 0;
    const guard = this.upkeepRole("guard", nguard);
    if(guard) {
        return guard;
    }
    
    if(!this.farm) {
        if(room.energyOpen < 150) {
            return this.upkeepRole("farmer");
        }
        return "need energy, no visibility";
    }
    
    const srcs = this.farm.cachedFind(FIND_SOURCES);
    const nreserver = this.memOr("nreserver", srcs.length -1);
    
    const extra = nreserver > 0? 150: 0;
    
    if(room.energyOpen <= extra) {
        return "need energy";
    }
    
    const controller = this.farm.controller;
    
    const claimed = controller && controller.reservation && !controller.my;

    const canReserve = !this.attacked && controller && !claimed && controller.resTicks < 4000;
    
    const nfarmer = this.memOr("nfarmer", srcs.length + claimed? 0: 1);
    
    return this.upkeepRole("farmer", nfarmer) ||
        canReserve && this.upkeepRole("reserver", nreserver);
  }
  
  get attacked() {
      const delta = this.memory.attacked - Game.time;
      if(delta > 0) {
          return delta;
      }
      return 0;
  }

  roleFarmer() {
    let body = [
      MOVE, WORK,  MOVE, CARRY, MOVE, CARRY,
      MOVE, WORK,  MOVE, CARRY, MOVE, CARRY,
      MOVE, WORK,  MOVE, CARRY, MOVE, CARRY,
      MOVE, WORK,  MOVE, CARRY, MOVE, CARRY,
    ];
    return this.createRole(body, 4, {role: 'farmer'});
  }

  roleReserver() {
    let body = [MOVE, MOVE, CLAIM, CLAIM, MOVE, CLAIM];
    return this.createRole(body, 4, {role: 'reserver'});
  }
  
  roleGuard() {
      let body = [
          MOVE, TOUGH, MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, HEAL,
          MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
      ];
      return this.createRole(body, 6, {role: 'guard'});
  }

  get farm() {
    return (this.flag || {}).room;
  }

  get flag() {
    return Game.flags[this.memory.flag];
  }
}
modsquads.Squad.register(FarmSquad);

StructureSpawn.prototype.newFarmSquad = function(name) {
  const squad = name;
  const mem = {
    flag: name,
  };
  return this.newSquad(squad, FarmSquad, mem);
};

Creep.prototype.roleReserver = function() {
  return this.actionTask() ||
      this.actionTravelFlag(this.squad.flag) ||
      this.actionReserve(this.squad.farm);
};

Creep.prototype.roleFarmer = function() {
  this.idleNom();
  return this.actionHospital() ||
      this.actionTask() ||
      !this.carryTotal && this.actionTravelFlag(this.squad.flag) ||
      this.actionRoadUpkeep(this.squad.farm) ||
      this.actionFarm(this.squad.farm) ||
      this.carryTotal && this.actionTravel(this.squad.home.controller) ||
      this.actionXferNearest(this.squad.home);
};

Creep.prototype.actionRoadUpkeep = function(room) {
    if(!room) return false;
    return this.actionRepairStruct(STRUCTURE_ROAD, room) ||
        this.actionBuildStruct(STRUCTURE_ROAD, room) ||
        this.actionBuildRoom(room);
}

Creep.prototype.actionFarm = function(room) {
    if(!room) return false;
    if(!this.carryFree) return false;
    
  let resource = _.find(room.cachedFind(FIND_DROPPED_RESOURCES), r => r.resourceType != RESOURCE_ENERGY || r.amount > 20);
  if(resource) {
      return this.actionPickup(resource);
  }
  
  let store = _.find(
      room.cachedFind(FIND_STRUCTURES),
      s => s.storeTotal);
  if(store) {
      return this.actionUnstore(store);
  }
  
  return this.actionHarvestAny(room);
};


Creep.prototype.actionXferNearest = function(room) {
    if(!room) {
        return false;
    }
    let stores = room.Structures(STRUCTURE_CONTAINER);
   if(room.storage) {
        stores.push(room.storage);
    }
    if(room.terminal) {
        stores.push(room.terminal);
    }
    stores = _.filter(stores, s => s.storeFree > this.carryTotal);

    const store = this.pos.findClosestByRange(stores);
    this.dlog("closest store", store);
    
    const batteries = _.filter(
        room.Structures(STRUCTURE_LAB)
            .concat(room.Structures(STRUCTURE_TOWER))
            .concat(room.Structures(STRUCTURE_LINK)),
        b => b.energyFree > this.carryTotal);
        
    const battery = this.pos.findClosestByRange(batteries);
    
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
    if(!store) {
        return false;
    }
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
    const resource = modutil.randomResource(this.carry);
    const err = this.transfer(store, resource);
    if(err == ERR_NOT_IN_RANGE) {
        return this.idleMoveTo(store);
    }
    if(err == OK) {
        return resource;
    }
    return false;
};


Creep.prototype.actionXferEnergy = function(battery) {
    this.dlog("xfer energy", battery);
    if(!battery) {
        return false;
    }
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
    const err = this.transfer(battery, RESOURCE_ENERGY);
    if(err == ERR_NOT_IN_RANGE) {
        return this.idleMoveTo(battery);
    }
    if(err == OK) {
        return "success";
    }
    return false;
};
