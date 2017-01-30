const registry = {};

class Squad {
  constructor(name) {
    this.name = name;
    this.creeps = [];
    const cnames = [];
    for (let i in this.memory.creeps) {
      const cname = this.memory.creeps[i];
      let c = Game.creeps[cname];
      if (c) {
        this.creeps.push(c);
        cnames.push(cname);
      }
    }
    Memory.squads[name].creeps = cnames;
    this.memory
  }
  
  get creepsByRole() {
      if(!this._creepsByRole) {
          this._creepsByRole = _.groupBy(this.creeps, c => c.memory.role);
      }
      return this._creepsByRole;
  }
  
  roleCreeps(role) {
      return this.creepsByRole[role] || [];
  }

  get spawn() {
    return Game.spawns[this.memory.spawn] || Game.getObjectById(this.memory.spawn);
  }

  get flag() {
    return Game.flags[this.memory.flag];
  }

  get home() {
    return this.spawn.room;
  }

  get memory() {
    return Memory.squads[this.name];
  }

  trackCreep(creeps, who) {
    if (_.isString(who)) {
      creeps.push(who);
    }
    return who;
  }

  createRole(body, min, mem) {
    mem.squad = this.name;
    const who = this.spawn.createRole(body, min, mem);
    return this.trackCreep(this.memory.creeps, who);
  }

  undertaker(creeps) {
    _.remove(creeps, s => this.memory.creeps.indexOf(s) == -1);
  }
  
  preemptive(role) {
      const creeps = this.roleCreeps(role);
      for(let creep of creeps) {
          if(creep.ticksToLive < 100) {
              const fname = _.camelCase('role ' + role);
              const fn = this[fname];
              if(fn){
                  return fn.apply(this);
              }
          }
      }
  }

  static register(klass) {
    registry[klass.name] = klass;
  }
}

StructureSpawn.prototype.newSquad = function(name, klass, mem) {
  Memory.squads[name] = {
    squad: klass.name,
    creeps: [],
    spawn: this.name,
  };
  _.assign(Memory.squads[name], mem || {});
  return Memory.squads[name]
};

class WorkSquad extends Squad {
  execute() {
    if (!this.spawn) {
      return 'no spawn';
    }
    const nworkers = this.creeps.length;
    if (!(nworkers < this.memory.nworkers)) {
      return 'Enough workers';
    }
    const room = this.spawn.room;
    if (this.spawn.spawning ||
        room.energyAvailable < room.energyCapacityAvailable) {
      return 'no spawning';
    }
    const who = this.roleWorker();
    if (_.isString(who)) {
      this.memory.creeps.push(who);
      return 'spawned ' + who;
    }
    return modutil.sprint('fail build', who);
  }


  roleWorker() {
    let body = [
      CARRY, WORK, MOVE, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
      CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
      CARRY, MOVE, WORK, CARRY, MOVE, WORK, WORK,  MOVE, WORK,
      MOVE,  WORK, MOVE, WORK,  MOVE, WORK, MOVE,
    ];
    return this.spawn.createRole(body, 3, {role: 'worker', squad: this.name});
  }
}
Squad.register(WorkSquad);

StructureSpawn.prototype.newWorkSquad = function() {
  const squad = 'Work' + this.name;
  return this.newSquad(
      squad, WorkSquad, {rooms: [this.pos.roomName], nworkers: 1});
};

module.exports = {
  Squad: Squad,

  run: () => {
    Game.squads = {};
    const squadNames = _.keys(Memory.squads);
    for (let i in squadNames) {
      const name = squadNames[i];
      Game.squads[name] = new registry[Memory.squads[name].squad](name);
    }

    _.each(Game.squads, squad => squad.execute());
  }
};
