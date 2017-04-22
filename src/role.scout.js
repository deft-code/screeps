Creep.prototype.roleScout = function() {
  return this.taskTask() || this.actionHospital() ||
      this.idleMoveTo(Game.flags.scout);
};

StructureSpawn.prototype.roleScout = function() {
  const body = [TOUGH, MOVE, MOVE];
  return this.createCreep(body, undefined, {role: 'scout'});
};

Creep.prototype.roleDistraction = function() {
  return this.taskTask() || this.actionHospital() || this.taskDistraction();
};

Creep.prototype.taskDistraction = function() {
  if (this.memory.duck || !Game.flags.distraction) {
    const dirs = [TOP, BOTTOM];
    this.move(_.sample(dirs));
    return 'hold position';
  }
  if (this.pos.isEqualTo(Game.flags.distraction)) {
    this.memory.duck = true;
    return 'in place';
  }
  delete this.memory.duck;
  this.moveTo(Game.flags.distraction);
};

StructureSpawn.prototype.roleDistraction = function() {
  const body = [
    TOUGH,
    TOUGH,
    TOUGH,

    MOVE,
    MOVE,
    MOVE,
    MOVE,

    ATTACK,
  ];
  return this.createCreep(body, undefined, {role: 'distraction'});
};

Creep.prototype.roleBait = function() {
  return this.taskTask() || this.actionHospital() ||
      this.idleMoveTo(Game.flags.bait);
};

StructureSpawn.prototype.roleBait = function() {
  const body = [
    TOUGH,
    TOUGH,
    TOUGH,

    MOVE,
    MOVE,
    MOVE,
    MOVE,

    ATTACK,
  ];
  return this.createCreep(body, undefined, {role: 'bait'});
};
