const util = require('util');

Flag.prototype.runTeam = function() {
  util.markDebug(this);
  this.memory.creeps = this.memory.creeps || [];
  const removed = _.remove(this.memory.creeps, cname => !Game.creeps[cname]);
  if(removed.length) {
    this.dlog("Dead Creeps", removed);
  }
  this.creeps = this.memory.creeps.sort().map(name => Game.creeps[name]);
  this.creepsByRole = _.groupBy(this.creeps, c => c.memory.role);
  this.dlog("my creeps", JSON.stringify(_.mapValues(this.creepsByRole, creeps => _.map(creeps, "name"))));
};

Flag.prototype.makeTeam = function(name, force=false) {
  const team = this.memory.team;
  if(!team || force) {
    this.memory.team = name;
    this.memory.debug = true;
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

Flag.prototype.upkeepRole = function(role, n, energy, priority=0, dist=0) {
  const creeps = this.roleCreeps(role);

  n = this.memOr('n' + role, n);
  if (creeps.length >= n) return false;

  this.dlog("team upkeepRole", role, n, energy, priority);

  const spawn = this.findSpawn(energy, dist);
  if (!spawn) return false;
  return spawn.enqueueRole(this, role, priority) && spawn.name;
};

Flag.prototype.findSpawn = function(energy=0, dist=0) {
  return _(Game.spawns)
    .filter(spawn =>
      spawn.room.energyAvailable >= energy &&
      this.spawnDist(spawn) <= dist &&
      !spawn.spawning)
    .shuffle()
    .concat([null])
    .min(spawn => this.spawnDist(spawn));
};

Flag.prototype.createRole = function(spawn, body, mem) {
  mem.team = this.name;
  this.dlog("spawning", spawn);
  const who = spawn.createRole2(body, mem);
  if(_.isString(who)){
    this.memory.creeps.push(who);
    return who;
  }
  return false;
};

Flag.prototype.spawnDist = function(spawn) {
  if(!spawn) return Infinity;

  const mem = this.memory = this.memory || {};
  // TODO delete this
  //delete this.memory.spawnDist;
  let cache = mem.spawnDist;
  if(!cache || !this.pos.isEqualTo(cache.pos)) {
    cache = mem.spawnDist = { pos: this.pos };
  }
  let dist = cache[spawn.name];
  if (dist === undefined) {
    dist = cache[spawn.name] = Game.map.findRoute(this.pos.roomName, spawn.room).length;
    cache.min = Math.min(cache.min||0, dist);
  }
  return dist;
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
  if(fn) {
    this.dlog(fn.call(this));
  } else {
    this.dlog("Missing fn", fname);
  }
};

Flag.prototype.teamNull = function() {
  this.dlog("is Team Null");
  switch(this.secondaryColor) {
      case COLOR_GREEN:
          this.makeTeam("farm");
          return "farm";
  }
  return 'null';
};
