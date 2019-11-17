module.exports = class CreepDropper {
  roleDropper () {
    let what = this.taskTask()
    if (what) return what

    if (this.store.getUsedCapacity()) {
      if (this.pos.isNearTo(this.team)) {
        const err = this.drop(RESOURCE_ENERGY)
        return err === OK && this.store.energy
      }
      if (this.room.name === this.team.pos.roomName) {
        return this.moveNear(this.team)
      }
      return this.taskMoveFlag(this.team)
    }

    return this.taskMoveRoom(this.home.storage) || this.taskRecharge()
  }

  afterDropper () {
    if (!this.atTeam) {
      this.idleNom()
    }
  }
}
