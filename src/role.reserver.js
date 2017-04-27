const lib = require('lib');

Flag.prototype.roleReserver = function(spawn) {
  let body = [MOVE, MOVE, CLAIM, CLAIM, MOVE, CLAIM];
  return this.createRole(spawn, body, {role: 'reserver'});
};

class CreepReserver {
  roleReserver() {
    return this.taskTask() || this.taskMoveFlag(this.team) ||
        this.taskReserve(this.team.room.controller);
  }
}

lib.merge(Creep, CreepReserver);
