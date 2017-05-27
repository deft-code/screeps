module.exports = class CreepDrain {
  roleDrain() {
    if(this.hurts) {
      if(this.room.name === this.team.pos.roomName ||
        this.pos.exit) {
        return this.idleMoveRoom(this.home.controller, {ignoreCreeps: false});
      }
    }
    return this.taskHealRoom() || this.moveNear(this.team);
  }

  afterDrain() {
    this.idleHeal();
  }
};
