Creep.prototype.roleGuard = function() {
    this.actionSelfHeal();
    return this.actionRetreat(TOUGH) ||
        this.actionTask() ||
        this.actionTravelFlag(this.squad.flag) ||
        this.actionArcher() ||
        this.actionHealAny() ||
        this.actionMoveFlag(this.squad.flag);
};

Creep.prototype.actionRetreat = function(part) {
    if(this.getActiveBodyparts(part)) {
        return false;
    }
    return this.actionMoveTo(this.home.controller);
};


Creep.prototype.actionHealAny = function() {
  const heal = _(this.room.cachedFind(FIND_MY_CREEPS))
                   .filter(c => c.hits < c.hitsMax)
                   .sample();
  return this.actionHeal(heal);
};

Creep.prototype.actionHeal = function(creep) {
  if(!creep) {
      return false;
  }
  this.say(creep.name);
  this.memory.task = {
    task: 'heal',
    creep: creep.name,
  };
  return this.taskHeal();
};

Creep.prototype.taskHeal = function() {
  const creep = this.taskCreep;
  if(!creep || !creep.hurts) {
      return false;
  }
  const err = this.heal(creep);
  if (err == ERR_NOT_IN_RANGE) {
    this.heal(this);
    return this.actionChase(creep);
  }
  if (err == OK) {
    this.move(this.pos.getDirectionTo(creep));
    return creep.hits;
  }
  return false;
};