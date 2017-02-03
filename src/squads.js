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
      let s = Game.spawns[this.memory.spawn];
      if(!s) {
          s = Game.getObjectById(this.memory.spawn);
          this.memory.spawn = s.name;
      }
      return s;
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
  
  memOr(key, value) {
      const v = this.memory[key];
      if(v === undefined) {
          return value;
      }
      return v;
  }

  trackCreep(creeps, who) {
    if (_.isString(who)) {
      creeps.push(who);
    }
    return who;
  }

  upkeepRole(role, n) {
      n = this.memOr("n" + role, n);
      const creeps = this.roleCreeps(role);
      if(creeps.length < n) {
          console.log("upkeepROle > spawnROle", role, creeps.length, n);
          return this.spawnRole(role);
      }
      return false;
  }
  
  spawnRole(role) {
    const fname = _.camelCase('role ' + role);
      const fn = this[fname];
      if(fn){
          return fn.apply(this);
      }
  }
  
  createRole(body, min, mem) {
    mem.squad = this.name;
    const who = this.spawn.createRole(body, min, mem);
    this.trackCreep(this.memory.creeps, who);
    if(_.isString(who)) {
        return who;
    }
    return false;
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


module.exports = {
  Squad: Squad,

  run: () => {
    Game.squads = {};
    const squadNames = _.keys(Memory.squads);
    //console.log("squadNames", squadNames.length, squadNames);
    for (let i in squadNames) {
      const name = squadNames[i];
      Game.squads[name] = new registry[Memory.squads[name].squad](name);
    }

    _.each(Game.squads, squad => console.log(Game.time, squad.name, squad.execute()));
    //_.each(Game.squads, squad => squad.execute());

  }
};
