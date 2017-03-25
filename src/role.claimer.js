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
    if(this.team.room) {
      return this.taskTravel(this.team.room.controller);
    } else {
      return this.taskTravelFlag(this.team);
    }
  }

  const err = this.claimController(this.team.room.controller);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(this.team.room.controller);
  }
};
