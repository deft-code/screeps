Flag.prototype.runTeam = function() {
  this.creeps = [];
  const cnames = [];
  for (let cname of this.memory.creeps) {
    let creep = Game.creeps[cname];
    if (c) {
      this.creeps.push(creep);
      cnames.push(cname);
    }
  }
  this.memory.creeps = cnames;
  this.creepsByRole = _.groupBy(this.creeps, c => c.memory.role);
};

Flag.prototype.roleCreeps = function(role) {
  return this.creepsByRole[role] || [];
};

Flag.prototype.memOr = function(key, value) {
  const v = this.memory[key];
  if (v === undefined) {
    return value;
  }
  return v;
};

Flag.prototype.upkeepRole = function(role, n, energy, priority) {
  const creeps = this.roleCreeps(role);

  n = this.memOr('n' + role, n);
  if (creeps.length >= n) return false;

  const spawn = this.findSpawn(energy);
  if (!spawn) return false;

  return spawn.enqueueRole(this, role, priority);
};

Flag.prototype.findSpawn = function(energy) {
  const spawns =
      _(Game.spawns)
          .filter(spawn => spawn.room.energyCapacityAvailable >= energy)
          .sortBy(spawn => this.spawnDist(spawn));

  if (!spawns.length) return false;

  const closest = spawns[0];
  let max = this.spawnDist(closest) + 50;
  if (closest.spawning) {
    max += closest.spawning.remainingTime;
  }
  return _.find(
      spawns,
      spawn => !spawn.spawning && spawn.room.energyAvailable > energy &&
          this.spawnDist(spawn) < max);
};

Flag.prototype.createRole = (body, mem) {
  mem.team = this.name;
  const who = this.spawn.createRole2(body, mem);
  if(_.isString(who){
    this.memory.creeps.push(who);
    return who;
  }
  return false;
}

Flag.prototype.spawnDist = function(spawn) {
  const mem = this.memory = this.memory || {};
  const cache = mem.spawnDist = mem.spawnDist || {};
  let dist = cache[spawn.name];
  if (!dist || !RoomPosition.FromMem(dist.pos).isEqualTo(this.pos) ||
      dist.expire < Game.time) {
    dist = cache[spawn.name] = {
      pos: this.pos,
      cost: PathFinder.search(this.pos, spawn.pos).cost,
      expire: Game.time + 100,
    };
  }
  return dist.cost;
};

Flag.prototype.run = function() {
  if (this.color != COLOR_BLUE) {
    return;
  }
  const mem = this.memory = this.memory || {};
  const team = mem.team || 'null';
  const fname = _.camelCase('team ' + team);
  const fn = this[fname];
  this.dlog(fn.call(this));
};

Flag.prototype.teamNull = function() {
  console.log(this.name, 'is teamNull');
  return 'null';
};
