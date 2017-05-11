Creep.prototype.roleMedic = function() {
  return this.taskTask() || this.taskTeamHeal(this.team);
};

Creep.prototype.taskRoomHeal = function(room) {
  if (!room) return false;
  return this.taskHealCreeps(room.find(FIND_MY_CREEPS));
};

Creep.prototype.taskTeamHeal = function(team) {
  if (!team) return false;
  return this.taskHealCreeps(team.creeps);
};

Creep.prototype.taskHealCreeps = function(creeps) {
  return this.taskHeal(_(creeps).filter('hurts').sample());
};

Creep.prototype.taskLocalHeal = function() {
  const heal = _(this.room.find(FIND_MY_CREEPS))
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
    return this.idleMoveTo(c);
  }
  if (err == OK) {
    this.move(this.pos.getDirectionTo(c));
    return c.hits;
  }
  return false;
};
