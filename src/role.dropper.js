Flag.prototype.roleDropper = function(spawn) {
  let body = [
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'dropper'});
};

Creep.prototype.roleDropper = function() {
  let what = this.taskTask();
  if (what) return what;

  if (this.carryTotal) {
    if (this.pos.isNearTo(this.team)) {
      const err = this.drop(RESOURCE_ENERGY);
      return err === OK && this.carry.energy;
    }
    if (this.room.name === this.team.pos.roomName) {
      return this.idleMoveTo(this.team);
    }
    return this.taskTravelFlag(this.team);
  }

  what = this.taskTravel(this.home.storage);
  if (what) return what;

  return this.taskRecharge();
};

Creep.prototype.afterDropper = function() {
  if (!this.atTeam) {
    this.idleNom();
  }
}



