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
    
    if (room.energyAvailable < room.energyCapacityAvailable) {
      return 'need energy';
    }
    
    if(!this.farm) {
        return "no visibility";
    }
    
    let nreserver = 0;
    
    const canReserve = !this.attacked &&
        this.farm.controller && this.farm.controller.resTicks < 4000;
  
    const srcs = this.farm.cachedFind(FIND_SOURCES);
    
    return this.upkeepRole("farmer", srcs.length+1) ||
        (canReserve && this.upkeepRole("reserver", 1));
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
    let body = [MOVE, MOVE, CLAIM, CLAIM];
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
    farmers: [],
    nfarmers: 1,
    reservers: [],
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
      (!this.carryTotal && this.actionTravelFlag(this.squad.flag)) ||
      this.actionRepairStruct(STRUCTURE_ROAD, this.squad.farm) ||
      this.actionBuildStruct(STRUCTURE_ROAD, this.squad.farm) ||
      ((this.carryFree > this.carryTotal) && this.actionHarvestAny(this.squad.farm)) ||
      this.carryTotal && this.actionTravel(this.squad.home.controller) ||
      this.actionXferNearest(this.squad.home);
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
        return this.actionMoveTo(store);
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
        return this.actionMoveTo(battery);
    }
    if(err == OK) {
        return "success";
    }
    return false;
};
