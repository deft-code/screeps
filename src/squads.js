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
  }

  get spawn() {
    return Game.getObjectById(this.memory.spawn);
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

  static register(klass) {
    registry[klass.name] = klass;
  }
}

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

StructureSpawn.prototype.newSquad = function(name, klass, mem) {
  Memory.squads[name] = {
    squad: klass.name,
    creeps: [],
    spawn: this.id,
  };
  _.assign(Memory.squads[name], mem || {});
  return Memory.squads[name]
};

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
