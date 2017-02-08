Creep.prototype.actionChase = function(creep) {
    if(this.pos.inRangeTo(creep, 3)) {
        this.move(this.pos.getDirectionTo(creep));
        return "nudge";
    }
    return this.idleMoveTo(creep);
};

Creep.prototype.idleRetreat = function(part) {
    if(this.getActiveBodyparts(part)) {
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
  if(!obj) return;

  if(this.pos.roomName === obj.pos.roomName && !this.pos.exit) {
      return false;
  }
  return this.idleMoveTo(obj);
};

Creep.prototype.idleMoveNear = function(obj, opts={}) {
  opts = _.defaults(opts, {range: 3});
  if(!obj || this.pos.inRangeTo(obj, opts.range)) return false;

  return this.idleMoveTo(obj, opts);
};

Creep.prototype.idleMoveWork = function(dest, opts={}) {
  opts = _.defaults(opts, {range: 3});
  return this.idleMoveNear(dest, opts);
};

Creep.prototype.idleMoveTo = function(obj, opts={}) {
  opts = _.defaults(opts, {
    useFindRoute: true,
  });
  const err = this.travelTo(obj, opts);
  if(err != ERR_NO_PATH) {
    return `moveTo ${err} ${obj.pos}`;
  }
  return false;
};

Creep.prototype.actionTravel = function(obj) {
    if(!obj) {
        return false;
    }
    this.memory.task = {
        task: 'travel',
        id: obj.id,
        note: obj.pos.roomName,
    };
    return this.taskTravel();
}

Creep.prototype.taskTravel = function() {
    const obj = this.taskId;
    if(!obj) {
        return false;
    }
    if(this.pos.roomName === obj.pos.roomName && !this.pos.exit) {
        return false;
    }
    return this.idleMoveTo(obj);
}

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
  const flag = this.taskFlag;
  if (!flag || this.pos.roomName === flag.pos.roomName && !this.pos.exit) {
    return false;
  }
  return this.idleMoveTo(flag);
};
