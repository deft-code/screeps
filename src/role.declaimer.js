module.exports = class RoleDeclaimer {
  roleDeclaimer () {
    const what = this.actionHospital() || this.taskTask()
    if (what) return what
    if (this.atTeam) {
      const c = this.room.controller
      if (c.my) return this.suicide()
      const err = this.attackController(c)
      if (err === ERR_NOT_IN_RANGE) {
        return this.moveNear(c)
      }
      if (err === OK) {
        this.log('ATTACKED!', c)
      }
      if (err === ERR_TIRED) {
        this.dlog('Already attacked', c)
      }
      return false
    }
    this.dlog('moving to team', this.team)
    return this.moveRoom(this.team)
  }

  afterDeclaimer () {}
}
