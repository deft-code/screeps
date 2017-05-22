module.exports = class CreepWolf {
  roleWolf() {
    return this.idleRetreat(TOUGH) || this.taskTask() ||
      this.idleMoveRoom(this.team) || this.taskWolf() ||
      this.movePeace(this.team);
  }

  afterWolf() {
    this.idleAttack();
  }

  taskWolf() {
    const creep = this.pos.findClosestByRange(this.room.enemies);
    return this.taskAttack(creep);
  }
};
