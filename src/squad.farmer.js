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
    
    if(!this.attacked() && this.farm && this.farm.hostiles.length) {
        this.memory.attacked = Game.time + this.farm.hostiles[0].ticksToLive;
    }
    
    if(this.attacked() && !this.armed()) {
        console.log("Retailiate spawn of farmer");
        return this.roleFarmer();
    }
    
    if (room.energyAvailable < room.energyCapacityAvailable) {
      return 'need energy';
    }
    this.undertaker(this.memory.farmers);
    if (this.memory.farmers.length < this.memory.nfarmers) {
      return this.roleFarmer();
    }
    if (!this.farm) {
      return 'enough';
    }

    this.undertaker(this.memory.reservers);
    const nreservers =
        this.memory.nreservers || this.farm.cachedFind(FIND_SOURCES).length - 1;

    if (this.memory.reservers.length < nreservers &&
        this.farm.controller && this.farm.controller.resTicks < 4000) {
      console.log('Squad', this.name, this.memory.reservers, nreservers);
      return this.roleReserver();
    }
    return 'enough';
  }
  
  armed() {
        for(let creep of this.roleCreeps("farmer")) {
            if(creep.memory.armed) {
                return true;
            }
        }
        return false;
  }
  
  attacked() {
      const end = this.memory.attacked;
      if(end < Game.time) {
          return true;
      }
      delete this.memory.attacked;
      return false;
  }

  roleFarmer() {
    let body = [
      MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK,
      MOVE, CARRY, MOVE, CARRY, MOVE, WORK,  MOVE, CARRY,
      MOVE, CARRY, MOVE, WORK,  MOVE, CARRY, MOVE, CARRY,
    ];
    let min = 4;
    if(this.attacked()) {
      min = 8;
      body = [TOUGH, MOVE, ATTACK, MOVE].concat(body);
    }
    const who = this.createRole(body, min, {role: 'farmer', armed: this.attacked()});
    return this.trackCreep(this.memory.farmers, who);
  }

  roleReserver() {
    let body = [MOVE, MOVE, CLAIM, CLAIM];
    const who = this.createRole(body, 4, {role: 'reserver'});
    return this.trackCreep(this.memory.reservers, who);
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
      this.dlog("after task") ||
      (!this.carryTotal && this.actionTravelFlag(this.squad.flag)) ||
      this.dlog("after travel", this.squad.flag, this.carryTotal) ||
      this.actionRepairStruct(STRUCTURE_ROAD, this.squad.farm) ||
      this.actionBuildStruct(STRUCTURE_ROAD, this.squad.farm) ||
      ((this.carryFree > this.carryTotal) &&
       this.actionHarvestAny(this.squad.farm)) ||
      this.actionStore(this.squad.home.storage) ||
      this.actionStoreAny(this.squad.home);
}
