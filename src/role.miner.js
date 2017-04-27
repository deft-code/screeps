Flag.prototype.roleMiner = function(spawn) {
  const body = [
    MOVE,
    CARRY,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
  ];
  return this.createRole(spawn, body, {role: 'miner'});
};

Creep.prototype.roleMiner = function() {
  return this.taskTask() || this.taskMoveFlag(this.team) || this.taskHarvestAny();
};
