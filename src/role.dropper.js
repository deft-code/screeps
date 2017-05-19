Creep.prototype.roleDropper = function() {
  let what = this.taskTask();
  if (what) return what;

  if (this.carryTotal) {
    if (this.pos.isNearTo(this.team)) {
      const err = this.drop(RESOURCE_ENERGY);
      return err === OK && this.carry.energy;
    }
    if (this.room.name === this.team.pos.roomName) {
      return this.moveNear(this.team);
    }
    return this.taskMoveFlag(this.team);
  }

  return this.taskMoveRoom(this.home.storage) || this.taskRecharge();
};

Creep.prototype.afterDropper = function() {
  if (!this.atTeam) {
    this.idleNom();
  }
}



