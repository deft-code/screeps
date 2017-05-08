Flag.prototype.roleGuard = function(spawn) {
  let body = [
    MOVE,
    TOUGH,
    MOVE,
    TOUGH,
    MOVE,
    RANGED_ATTACK,
    MOVE,
    HEAL,
    MOVE,
    RANGED_ATTACK,
    MOVE,
    RANGED_ATTACK,
  ];

  def = {
    move: 1,
    nocarry: true,
    level: [CARRY, WORK],
    mem: {role: 'bootstrap'},
  };

  def = {
    move: 2,
    nocarry: true,
    prefix: [CARRY, WORK],
    level: [WORK],
    max: 5,
    mem: {role: 'srcer'},
  };

  def = {
    move: 1,
    prefix: [HEAL],
    level: [TOUGH, RANGED_ATTACK],
    mem: {role: 'guard'},
  };

  return this.createRole(spawn, body, {role: 'guard'});
};



Creep.prototype.roleGuard = function() {
  this.taskSelfHeal();
  return this.idleRetreat(TOUGH) || this.taskTask() ||
      this.taskArcher(this.team.room) ||
      // this.actionRoomHeal(this.team.room) ||
      this.idleMoveRoom(this.team);
};
