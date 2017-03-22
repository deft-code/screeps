const lib = require('lib');

Creep.prototype.idleMoveTo = function(obj, opts = {}) {
  if (!obj) return false;
  opts = _.defaults(opts, {
    useFindRoute: true,
  });
  const err = this.travelTo(obj, opts);
  if (err != ERR_NO_PATH) {
    this.intents.move = lib.getPos(obj);
    return `moveTo ${err} ${obj.pos}`;
  }
  return false;
};

Creep.prototype.actionChase = function(creep) {
  if (this.pos.inRangeTo(creep, 3)) {
    this.move(this.pos.getDirectionTo(creep));
    return 'nudge';
  }
  return this.idleMoveTo(creep);
};

Creep.prototype.idleRetreat = function(part) {
  if (this.getActiveBodyparts(part)) {
    return false;
  }
  return this.idleMoveTo(this.home.controller);
};

Creep.prototype.actionHospital = function() {
  if ((this.hurts > 100 || this.hits < 100) &&
      !this.pos.inRangeTo(this.home.controller, 5)) {
    return this.idleMoveTo(this.home.controller);
  }
  return false;
};

Creep.prototype.idleTravel = function(obj) {
  if (!obj) return false;

  const p = this.pos;
  this.dlog("idle travel", p);
  if (obj.pos.roomName === p.roomName &&
   p.x > 1 && p.x < 48 &&
      p.y > 1 && p.y < 48) {
    return false;
  }
  return this.idleMoveTo(obj);
};

Creep.prototype.idleMoveNear = function(target, opts = {}) {
  opts = _.defaults(opts, {range: 1});
  if (!target || this.pos.inRangeTo(target, opts.range)) return false;

  return this.doMoveTo(target, opts);
};

Creep.prototype.idleMoveRange = function(target, opts = {}) {
  opts = _.defaults(opts, {range: 3});
  if (!target || this.pos.inRangeTo(target, opts.range)) return false;

  return this.doMoveTo(target, opts);
};

Creep.prototype.actionTravel = function(obj) {
  if (!obj) {
    return false;
  }
  this.memory.task = {
    task: 'travel',
    id: obj.id,
    note: obj.pos.roomName,
  };
  return this.taskTravel();
};

Creep.prototype.taskTravel = function() {
  const obj = this.taskId;
  if (!obj) {
    return false;
  }
  if (this.pos.roomName === obj.pos.roomName && !this.pos.exit) {
    return false;
  }
  return this.idleMoveTo(obj);
};

Creep.prototype.actionTravelFlag = function(flag) {
  if (!flag) {
    return false;
  }
  this.memory.task = {
    task: 'travel flag',
    flag: flag.name,
    note: flag.note,
  };
  return this.taskTravelFlag();
};

Creep.prototype.taskTravelFlag = function() {
  return this.idleTravel(this.taskFlag);
};
