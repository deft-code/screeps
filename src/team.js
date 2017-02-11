const util = require('util');

Flag.prototype.runTeam = function() {
  util.markDebug(this);
  this.memory.creeps = this.memory.creeps || [];
  const removed = _.remove(this.memory.creeps, cname => !Game.creeps[cname]);
  if(removed.length) {
    this.dlog("Dead Creeps", removed);
  }
  if(this.room) {
    let stolen = this.memory.creeps.concat(_.map(this.room.find(FIND_MY_CREEPS), 'name'));
    this.memory.creeps = _.uniq(stolen);
  }
  this.creeps = this.memory.creeps.sort().map(name => Game.creeps[name]);
  for(let creep of this.creeps) {
    if(!creep.memory.team) {
      creep.memory.team = this.name;
    }
  }
  this.creepsByRole = _.groupBy(this.creeps, c => c.memory.role);
};

Flag.prototype.makeTeam = function(name, force=false) {
  const team = this.memory.team;
  if(!team || force) {
    this.memory.team = name;
    return true;
  }
  return false;
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

Flag.prototype.upkeepRole = function(role, n, energy, priority=0) {
  const creeps = this.roleCreeps(role);

  n = this.memOr('n' + role, n);
  if (creeps.length >= n) return false;

  this.dlog("team upkeepRole", role, n, energy, priority);

  const spawn = this.findSpawn(energy);
  if (!spawn) return false;

  return spawn.enqueueRole(this, role, priority) && spawn.name;
};

Flag.prototype.findSpawn = function(energy=0, dist=50) {
  const spawns =
      _(Game.spawns)
          .filter(spawn => spawn.room.energyCapacityAvailable >= energy)
          .sortBy(spawn => this.spawnDist(spawn))
          .value();

  if (!spawns.length) return false;

  const closest = spawns[0];
  this.dlog("closest spawn", closest);
  let max = this.spawnDist(closest) + dist;
  if (closest.spawning) {
    max += closest.spawning.remainingTime;
  }
  return _.find(
      spawns,
      spawn => !spawn.spawning && spawn.room.energyAvailable > energy &&
          this.spawnDist(spawn) < max);
};

Flag.prototype.createRole = function(spawn, body, mem) {
  mem.team = this.name;
  const who = spawn.createRole2(body, mem);
  if(_.isString(who)){
    this.memory.creeps.push(who);
    return who;
  }
  return false;
}

Flag.prototype.spawnDist = function(spawn) {
  const mem = this.memory = this.memory || {};
  let cache = mem.spawnDist;
  if(!cache || !this.pos.isEqualTo(cache.pos)) {
    cache = mem.spawnDist = { pos: this.pos };
  }
  let dist = cache[spawn.name];
  if (!dist || dist.expire < Game.time) {
    dist = cache[spawn.name] = {
      cost: PathFinder.search(this.pos, spawn.pos).cost,
      expire: Math.floor(Game.time + 100 + 50 * Math.random()),
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
  this.runTeam();
  this.dlog(fn.call(this));
};

Flag.prototype.teamNull = function() {
  this.dlog("is Team Null");
  return 'null';
};
