const util = require('util');
const lib = require('lib');

class CreepExtra {
  get home() {
    return Game.rooms[this.memory.home];
  }

  get team() {
    return Game.flags[this.memory.team];
  }
}

lib.cachedProp(
    Creep, 'atTeam', creep => creep.room.name === creep.team.pos.roomName);
lib.cachedProp(Creep, 'atHome', creep => creep.room.name === creep.memory.home);

lib.cachedProp(Creep, 'teamRoom', creep => creep.team && creep.team.room);

Creep.prototype.run = function() {
  if (this.spawning) {
    this.memory.home = this.room.name;
    this.memory.cpu = 0;
    return 'spawning';
  }

  const start = Game.cpu.getUsed();
  util.markDebug(this);
  this.intents = {};

  const role = _.camelCase('role ' + this.memory.role);
  const roleFunc = this[role] || this.roleUndefined;
  const what = roleFunc.apply(this);

  const after = _.camelCase('after ' + this.memory.role);
  const afterFunc = this[after] || this.afterUndefined;
  if (_.isFunction(afterFunc)) afterFunc.apply(this);

  if (this.memory.task) {
    const first = this.memory.task.first;
    if (first && first.roomName === this.room.name) {
      this.room.visual.line(this.pos, first);
    }
    delete this.memory.task.first;
  }

  const total = Math.floor(1000 * (Game.cpu.getUsed() - start));
  this.memory.cpu += total;
  let rate = this.memory.cpu;
  const age = CREEP_LIFE_TIME - this.ticksToLive;
  if (age > 0) {
    rate = Math.floor(rate / age);
  }

  this.dlog(`cpu ${total}:${rate} ${what}`);
};

Creep.prototype.busy = function(...intents) {
  return _.any(intents, intent => this.intents[intent]);
};

Creep.prototype.doMove = function(dir) {
  if (this.busy(MOVE)) return this.intents.move;
  if (!target) return false;

  const err = this.move(dir);
  switch (err) {
    case OK:
      this.intents.move = `direction ${dir}`;
      return this.intents.move;
    case ERR_TIRED:
    case ERR_BUSY:
      console.log(this, 'Unexpected move error!', err);
  }
  return false;
};

Creep.prototype.doMoveTo = function(target, opts = {}) {
  if (this.busy(MOVE)) return this.intents.move;
  if (!target) return false;

  const weight = this.weight;
  const fatigue = this.bodyInfo().fatigue;
  this.dlog('doMoveTo', weight, fatigue, target);

  opts = _.defaults(opts, {
    // useFindRoute: true,
    ignoreRoads: fatigue > weight,
  });
  const err = this.travelTo(target, opts);
  switch (err) {
    case OK:
      this.intents.move = target;
      return `move ${target.pos}`;
    case ERR_TIRED:
    case ERR_BUSY:
      console.log(this, 'Unexpected moveTo error!', err);
  }
  return false;
};

lib.cachedProp(
    Creep, 'partsByType',
    creep => _(creep.body).filter(part => part.hits).countBy('type').value());

lib.cachedProp(
    Creep, 'ignoreRoads',
    creep => creep.body.length >= 2 * creep.getActiveBodyparts(MOVE));

lib.cachedProp(
    Creep, 'hostile',
    creep => creep.getActiveBodyparts(ATTACK) ||
        creep.getActiveBodyparts(RANGED_ATTACK));

lib.cachedProp(
    Creep, 'assault',
    creep => creep.hostile || creep.getActiveBodyparts(WORK) ||
        creep.getActiveBodyparts(CLAIM) >= 5);
