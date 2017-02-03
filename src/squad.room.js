const modsquads = require('squads');

class RoomSquad extends modsquads.Squad {
  constructor(name) {
    super(name);
  }

  execute() {
    console.log(Game.time, "execute", this.name);
    if (!this.spawn) {
        console.log(this.name, "no spawn");
      return 'no spawn';
    }
    const room = this.spawn.room;
    if (this.spawn.spawning) {
        console.log(this.name, this.spawn.name, "spawning")
      return 'spawning';
    }
    
    const who = this.upkeepRole("hauler", 1) ||
        this.upkeepRole("srcer", 1);
    if(who) {
        return who;
    }

    if (room.energyAvailable < room.energyCapacityAvailable) {
        console.log(this.name, "need energy");
      return 'need energy';
    }
    
    const nchemist = 0 // this.home.terminal? 1: 0;

    return this.upkeepRole("hauler", 2) ||
        this.upkeepRole("srcer", 2) ||
        this.upkeepRole("worker", 1)  ||
        this.upkeepRole("upgrader", 1) ||
        this.upkeepRole("chemist", nchemist) ||
        "enough";
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
