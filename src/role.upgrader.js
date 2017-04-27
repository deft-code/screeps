Flag.prototype.roleUpgrader = function(spawn) {
  let body = [
    MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, WORK,  MOVE,
    WORK, WORK, MOVE,  WORK, WORK, MOVE,  WORK, WORK, MOVE,  WORK,
    WORK, MOVE, WORK,  WORK, MOVE, WORK,  WORK, MOVE, WORK,  WORK,
    MOVE, WORK, WORK,  MOVE, WORK, WORK,  MOVE, WORK, WORK,  MOVE,
    WORK, WORK, MOVE,  WORK, WORK, MOVE,  WORK, WORK, CARRY, CARRY,
  ];
  const level = spawn.room.controller.level;
  if(level > 7) {
    body = body.slice(0, 24);
  }

  return this.createRole(spawn, body, {role: 'upgrader'});
};

Creep.prototype.roleUpgrader = function() {
  return this.taskTask() || this.taskUpgradeRoom() || this.taskRecharge();
};
