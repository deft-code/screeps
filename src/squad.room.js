const modsquads = require('squads');

class RoomSquad extends modsquads.Squad {
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
    
    const haulers = this.roleCreeps("hauler");
    if(!haulers.length) {
        return this.roleHauler();
    }
    
    const srcers = this.roleCreeps("srcer");
    if(!srcers.length) {
        return this.roleSrcer();
    }

    if (room.energyAvailable < room.energyCapacityAvailable) {
      return 'need energy';
    }
    
    const nhaulers = this.memory.nhaulers || 2;
    if(haulers.length < nhaulers) {
        return this.roleHauler();
    }
    
    const nsrcers = this.memory.nsrcers || 2;
    if(srcers.length < nsrcers) {
        return this.roleSrcer();
    }
    
    const workers = this.roleCreeps("worker");
    const nworkers = this.memory.nworkers || 1 ;
    if(workers.length < nworkers) {
        return this.roleWorker();
    }
    
    const upgraders = this.roleCreeps("upgrader");
    const nupgraders = this.memory.nupgraders || 1;
    if (upgraders.length < this.memory.nupgraders) {
      return this.roleUpgrader();
    }
    
    const nchemists = this.home.terminal? 1: 0;
    const chemists = this.roleCreeps("chemist");
    if( false&&chemists.length < nchemists) {
        return this.roleChemist();
    }
    
    return "skip";
    
    let who = this.preemptive("srcer");
    if(who) {
        return who;
    }
    
    return 'enough';
  }
  
  roleSrcer() {
    let body = [MOVE, WORK, WORK, WORK, WORK, CARRY, WORK, WORK, MOVE, MOVE];
    return this.createRole(body, 2, {role: "srcer"});
  }
  
  roleHauler() {
      const body = [
        MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,
        
        MOVE, CARRY, CARRY, MOVE, CARRY, CARRY,
        
        MOVE, CARRY, CARRY, MOVE, CARRY, CARRY
      ];
     return this.createRole(body, 2, {role: 'hauler'});
    }
    
  roleWorker() {
    let body = [
      CARRY, WORK, MOVE, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
      CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
      CARRY, MOVE, WORK, CARRY, MOVE, WORK, WORK,  MOVE, WORK,
      MOVE,  WORK, MOVE, WORK,  MOVE, WORK, MOVE,
    ];
    return this.createRole(body, 3, {role: 'worker'});
  }
     
  roleUpgrader() {
    let body = [
      MOVE, WORK, CARRY, MOVE, WORK, CARRY,

      MOVE, WORK, MOVE,  WORK, MOVE, WORK,

      MOVE, WORK, MOVE,  WORK, MOVE, WORK,

      MOVE, WORK, MOVE,  WORK, MOVE, WORK,
    ];
    return this.createRole(body, 4, {role: 'upgrader'});
  }

  get sources() {
    return _.map(this.memory.sources, Game.getObjectById);
  }
}
modsquads.Squad.register(RoomSquad);

StructureSpawn.prototype.newRoomSquad = function() {
  const squad = this.room.name;
  const srcs = _.sortBy(
      this.room.cachedFind(FIND_SOURCES), s => s.pos.getRangeTo(this.pos));
  const mem = {
    sources: _.map(srcs, 'id'),
    srcers: _.map(srcs, s => null),
    upgraders: [],
    nupgraders: 1,
  };
  return this.newSquad(squad, RoomSquad, mem);
};
