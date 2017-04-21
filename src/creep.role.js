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
