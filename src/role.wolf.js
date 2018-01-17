module.exports = class CreepWolf {
  roleMicro () { return this.roleWolf() }
  afterMicro () { return this.afterWolf() }
  roleWolf () {
    return this.idleRetreat(TOUGH) ||
      this.taskTask() ||
      // this.moveRoom(this.team) ||
      this.taskWolf() ||
      this.movePeace(this.team)
  }

  afterWolf () {
    this.idleAttack()
    if (this.info.heal) {
      this.idleHeal()
    }
  }

  taskWolf () {
    const creep = this.pos.findClosestByRange(this.room.enemies)
    return this.taskAttack(creep)
  }
}
