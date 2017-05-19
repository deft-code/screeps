module.exports = class CreepDrain {
  roleDrain() {
    if(this.hurts) {
        return this.idleMoveRoom(this.home.controller, {ignoreCreeps: false});
    }
    return this.moveNear(this.team);
  }

  afterDrain() {
    this.idleHeal();
  }
};
