Flag.prototype.roleClaimer = function(spawn) {
  const body = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
  return this.createRole(spawn, body, {role: 'claimer'});
};

Creep.prototype.roleClaimer = function() {
  if(this.team.room && this.team.room.controller.owner) {
    this.suicide();
    return 'SUICIDE!';
  }

  if(!this.atTeam) {
    if(this.teamRoom) {
      return this.taskTravel(this.team.room.controller);
    } else {
      return this.taskTravelFlag(this.team);
    }
  }

  const err = this.claimController(this.teamRoom.controller);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(this.teamRoom.controller);
  }
};
