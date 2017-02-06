Flag.prototype.roleMedic = function(spawn) {
  let body = [MOVE, HEAL];
  return this.createRole(spawn, body, {role: 'medic'});
};

Creep.prototype.roleMedic = function() {
  return this.actionTask() ||
    this.actionTeamHeal(this.team);
};

Creep.prototype.actionRoomHeal= function(room) {
  if(!room) return false;
  return this.actionHealCreeps(room.cachedFind(FIND_MY_CREEPS));
};

Creep.prototype.actionTeamHeal = function(team) {
  if(!team) return false;
  return this.actionHealCreeps(team.creeps);
};

Creep.prototype.actionHealCreeps = function(creeps) {
  return this.actionHeal(_(creeps)
    .filter("hurts")
    .sample());
};

Creep.prototype.actionHeal = function(creep) {
  if(!creep) return false;

  this.memory.task = {
    task: 'heal',
    creep: creep.name,
  };
  return this.taskHeal();
};

Creep.prototype.taskHeal = function() {
  const creep = this.taskCreep;
  if (!creep || !creep.hurts) return false;

  const err = this.heal(creep);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(creep);
  }
  if (err == OK) {
    this.move(this.pos.getDirectionTo(creep));
    return creep.hits;
  }
  return false;
};

Creep.prototype.actionLocalHeal = function() {
  const heal = _(this.room.cachedFind(FIND_MY_CREEPS))
                   .filter(c => c.hits < c.hitsMax)
                   .sample();
  if (!heal) {
    return false;
  }
  this.say(heal.name);
  this.memory.task = {
    task: 'local heal',
    creep: heal.name,
  };
  return this.taskLocalHeal();
};

Creep.prototype.taskLocalHeal = function() {
  const c = Game.creeps[this.memory.task.creep];
  if (!c || c.pos.roomName != this.pos.roomName || c.hits == c.hitsMax) {
    return false;
  }
  const err = this.heal(c);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(c);
  }
  if (err == OK) {
    this.move(this.pos.getDirectionTo(c));
    return c.hits;
  }
  return false;

};

