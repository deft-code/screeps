const util = require('util');

Flag.prototype.localSpawn = function(energy) {
  return (spawn) => this.spawnDist(spawn) === 0 &&
      spawn.room.energyAvailable >= energy;
};

Flag.prototype.closeSpawn = function(energy) {
  return (spawn) => this.spawnDist(spawn) <= this.minSpawnDist() + 1 &&
      spawn.room.energyAvailable >= energy;
};

Flag.prototype.remoteSpawn = function() {
  return (spawn) => this.spawnDist(spawn) > 0 &&
      spawn.room.energyFreeAvailable === 0 && spawn.room.storage &&
      spawn.room.storage.store.energy > 100000 &&
      (!this.room ||
       spawn.room.energyCapacityAvailable > this.room.energyCapacityAvailable);
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

Flag.prototype.upkeepRole = function(role, n, priority, filter) {
  const creeps = this.roleCreeps(role);

  n = this.memOr('n' + role, n);
  if (creeps.length >= n) return false;

  this.dlog('team upkeepRole', role, n, priority);

  const spawn = this.findSpawn(priority, filter);
  if (!spawn) return false;
  return spawn.enqueueRole(this, role, priority) && spawn.name;
};

Flag.prototype.findSpawn = function(priority, filter) {
  if (!this.memory.spawnDist) {
    this.memory.spawnDist = {};
  }
  return _(Game.spawns)
      .sortBy(spawn => this.spawnDist(spawn))
      .filter(spawn => spawn.room.energyAvailable >= 300 && !spawn.spawning)
      .filter(spawn => !spawn.nextRole || spawn.nextRole.priority < priority)
      .filter(filter)
      .first();
};

Flag.prototype.createRole = function(spawn, body, mem) {
  mem.team = this.name;
  this.dlog('spawning', spawn);
  const who = spawn.createRole(body, mem);
  if (_.isString(who)) {
    this.memory.creeps.push(who);
    return who;
  }
  return false;
};

Flag.prototype.minSpawnDist = function() {
  if (!this.memory.spawnDist) {
    this.memory.spawnDist = {}
  }
  return this.memory.spawnDist.min || 0;
};

Flag.prototype.spawnDist = function(spawn) {
  if (!spawn) return Infinity;

  const mem = this.memory = this.memory || {};
  let cache = mem.spawnDist;
  if (!cache || !this.pos.isEqualTo(cache.pos)) {
    cache = mem.spawnDist = {pos: this.pos};
  }
  let dist = cache[spawn.name];
  if (dist === undefined) {
    dist = cache[spawn.name] =
        Game.map.findRoute(this.pos.roomName, spawn.room).length;
    if (cache.min === undefined) {
      cache.min = dist
    } else {
      cache.min = Math.min(cache.min, dist);
    }
  }
  return dist;
};

Flag.prototype.run = function() {
  if (this.color !== COLOR_BLUE) {
    return 'no team';
  }

  if (!this.memory) {
    this.memory = {debug: true};
  }

  util.markDebug(this);
  this.memory.creeps = this.memory.creeps || [];
  const removed = _.remove(this.memory.creeps, cname => !Game.creeps[cname]);
  if (removed.length) {
    this.dlog('Dead Creeps', removed);
  }
  this.creeps = this.memory.creeps.sort().map(name => Game.creeps[name]);
  this.creepsByRole = _.groupBy(this.creeps, c => c.memory.role);
  this.dlog(
      'my creeps',
      JSON.stringify(
          _.mapValues(this.creepsByRole, creeps => _.map(creeps, 'name'))));

  if (!this.creeps.length) {
    this.memory.debug = true;
  }

  const customF = this['custom' + this.name];
  if (_.isFunction(customF)) {
    this.dlog('custom', this.name, customF.call(this));
  }
  switch (this.secondaryColor) {
    case COLOR_BLUE:
      return this.teamBase();
    case COLOR_GREEN:
      return this.teamFarm();
    case COLOR_GREY:
      return this.teamRole();
    case COLOR_BROWN:
      if (!this.creeps.length) {
        this.remove();
        console.log(this, 'Good Bye');
      }
      console.log(
          this, 'Good Bye', this.memory.creeps,
          _.sum(this.creeps, 'ticksToLive'));
      return 'Slow Delete';
  }
  return 'null';
};
