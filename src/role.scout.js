Creep.prototype.roleScout = function() {
  if (this.hits < this.hitsMax) {
    this.moveTo(Game.spawns.Home);
    return 'flee';
  }
  var f = Game.flags.Scout;
  if (f && !this.pos.isNearTo(f)) {
    this.moveTo(f);
    return 'move to flag';
  }
  return false;
};

Creep.prototype.roleDistraction = function() {
    return this.actionTask() ||
        this.actionHospital() ||
        this.actionDistraction();
};

Creep.prototype.actionDistraction = function() {
  if (this.memory.duck || !Game.flags.distraction) {
    const dirs = [TOP, BOTTOM];
    this.move(_.sample(dirs));
    return 'hold position';
  }
  if (this.pos.isEqualTo(Game.flags.distraction)) {
    this.memory.duck = true;
    return 'in place';
  }
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
