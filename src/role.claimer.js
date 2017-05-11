Creep.prototype.roleClaimer = function() {
  if (this.team.room && this.team.room.controller.owner) {
    this.suicide();
    return 'SUICIDE!';
  }

  if (!this.atTeam) {
    if (this.teamRoom) {
      return this.taskMoveRoom(this.team.room.controller);
    } else {
      return this.taskMoveFlag(this.team);
    }
  }

  const err = this.claimController(this.teamRoom.controller);
  if (err == ERR_NOT_IN_RANGE) {
    return this.moveNear(this.teamRoom.controller);
  }
};
