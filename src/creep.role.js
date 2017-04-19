const lib = require('lib');

Creep.prototype.roleUndefined = function() {
  this.dlog('Missing Role!');
};

lib.enhance(
    Creep, 'roleIndex',
    creep => _.findIndex(
        creep.team.roleCreeps(creep.memory.role),
        rc => rc.name === creep.name));

Creep.prototype.checkMem = function(name) {
  let mem = this.memory.task;
  if (mem && mem.task !== name) {
    delete this.memory.task;
    mem = undefined;
  }
  return mem;
};

Creep.prototype.checkFlag = function(name, flag) {
  if (_.isString(flag)) flag = Game.flags[flag];

  if (flag) {
    this.memory.task = {
      task: name,
      flag: flag.name,
      first: flag.pos,
    };
    return flag;
  }

  const mem = this.checkMem(name);
  if (mem) {
    flag = Game.flags[this.memory.task.flag];
    if (!flag) return false;
    if (this.debug) {
      this.room.visual.line(this.pos, flag.pos, {lineStyle: 'dotted'});
    }
    return flag;
  }

  return false;
};

Creep.prototype.checkId = function(name, obj) {
  if (_.isString(obj)) obj = Game.getObjectById(obj);

  if (obj) {
    this.memory.task = {
      task: name,
      id: obj.id,
      first: obj.pos,
    };
    return obj;
  }

  const mem = this.checkMem(name);
  if (mem) {
    obj = Game.getObjectById(this.memory.task.id);
    if (!obj) return false;

    if (this.debug) {
      this.room.visual.line(this.pos, obj.pos, {lineStyle: 'dotted'});
    }
    return obj;
  }

  return false;
};

Creep.prototype.preNom = function() {
  if (!this.carryFree) return;

  const src = _(this.room.find(FIND_DROPPED_RESOURCES))
                  .filter(e => e.pos.isNearTo(this))
                  .sample();
  if (src) {
    const err = this.pickup(src);
    if (err == OK) {
      this.say('Nom');
    } else {
      this.dlog('BAD Nom', err);
    }
  }
};

Creep.prototype.postPump = function() {
  if (this.carryFree < this.carry.energy) return;

  if (this.intents.withdraw) return;

  let pump = this.memory.pump;
  if (!pump) {
    pump = this.memory.pump = {};
  }
  let p = RoomPosition.FromMemory(pump.pos);
  if (!p || p.isEqualTo(this.pos)) {
    p = pump.pos = this.pos;
    pump.when = Game.time;
  }
  if (pump.when < Game.time) {
    if (pump.id === false) return;

    let target = Game.getObjectById(pump.id);
    if (!target) {
      target = _.find(
          this.room.findStructs(
              STRUCTURE_LINK, STRUCTURE_CONTAINER, STRUCTURE_STORAGE,
              STRUCTURE_TERMINAL),
          s => this.pos.isNearTo(s));
    }

    if (!target) pump.id = false;

    if (target) {
      this.intents.withdraw = target;
      const err = this.withdraw(target, RESOURCE_ENERGY);
      if (err !== OK) {
        pump.id = false;
      }
    }
  }
};
