Flag.prototype.roleCaboose = function(spawn) {
  let body = [
    MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL, MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
    MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL, MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
    MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL, MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
    MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL, MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
  ];
  const nparts = this.memOr('nparts', body.length);
  body = body.slice(0, nparts);
  return this.createRole(spawn, body, {role: 'caboose'});
};

Creep.prototype.roleCaboose = function() {
  return this.taskTask() || this.taskCabooseFind() ||
      this.taskSelfHeal() || this.idleMoveNear(this.team);
};

Creep.prototype.taskSelfHeal = function() {
  if (this.hurts) {
    this.heal(this);
  }
  return false;
};

Creep.prototype.taskCabooseFind = function() {
  if (this.team.creeps.length < 2) {
    return false;
  }
  this.dlog('caboose find');
  for (let creep of this.team.creeps) {
    if (creep.hostile) {
      return this.taskCaboose(creep);
    }
  }
  return false;
};

Creep.prototype.taskCaboose = function(creep) {
  creep = this.checkId('caboose', creep);
  this.dlog('task caboose', creep);
  if (!creep) {
    if (this.hurts) {
      this.heal(this);
    }
    return false;
  }
  if (creep.hurts > this.hurts) {
    if (this.pos.isNearTo(creep)) {
      this.heal(creep);
    } else if (this.pos.inRangeTo(creep, 3)) {
      this.rangedHeal(creep);
    } else if (this.hurts) {
      this.heal(this);
    }
    this.heal(creep)
  } else if (this.hurts) {
    this.heal(this);
  }

  if (this.pos.inRangeTo(creep, 3)) {
    this.move(this.pos.getDirectionTo(creep));
    return 'nudge';
  } else {
    this.idleMoveTo(creep);
    return 'chase';
  }
};
