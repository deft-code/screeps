module.exports = class CreepClaimer {
  roleClaimer () {
    const what = this.taskTask() || this.moveRoom(this.team) || this.moveNear(this.room.controller)
    if (what) return what

    if (this.room.controller.owner) {
      if (!this.room.controller.my) {
        const err = this.attackController(this.room.controller)
        if (err === OK) return this.room.controller.ticksToDowngrade
        this.dlog('attack error:', err)
      }
    } else {
      const err = this.claimController(this.teamRoom.controller)
      this.dlog('claim error:', err)
    }
  }
}
