Flag.prototype.roleUpgrader = function(spawn) {
  const body = [
    MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, WORK,  MOVE,
    WORK, WORK, MOVE,  WORK, WORK, MOVE,  WORK, WORK, MOVE,  WORK,
    WORK, MOVE, WORK,  WORK, MOVE, WORK,  WORK, MOVE, WORK,  WORK,
    MOVE, WORK, WORK,  MOVE, WORK, WORK,  MOVE, WORK, WORK,  MOVE,
    WORK, WORK, MOVE,  WORK, WORK, MOVE,  WORK, WORK, CARRY, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'upgrader'});
};

Creep.prototype.roleUpgrader = function() {
  return this.taskDoubleTime() || this.actionTask() || this.actionUpgrade() ||
      this.actionRecharge();
};
