const lib = require('lib');

class CreepReserver {
  roleReserver() {
    return this.taskTask() || this.taskMoveFlag(this.team) ||
        this.taskReserve(this.team.room.controller);
  }
}

lib.merge(Creep, CreepReserver);
