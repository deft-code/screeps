Creep.prototype.roleGuard = function() {
  this.taskSelfHeal();
  return this.idleRetreat(TOUGH) || this.taskTask() ||
      this.taskArcher(this.team.room) ||
      // this.actionRoomHeal(this.team.room) ||
      this.idleMoveRoom(this.team);
};
