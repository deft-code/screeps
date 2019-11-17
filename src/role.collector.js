module.exports = class CreepCollector {
  roleCollector () {
    let what = this.idleRetreat(CARRY) || this.taskTask()
    if (what) return what

    if (this.atTeam && this.store.getFreeCapacity()) {
      return this.taskCollect()
    }

    if (this.store.getUsedCapacity()) {
      if (this.pos.roomName === this.dropRoom().name) {
        return this.taskTransferResources()
      }
      return this.taskMoveRoom(this.dropRoom().controller)
    }

    return this.moveRoom(this.team)
  }

  afterCollector () {
    this.idleNomNom()
  }

  taskCollect () {
    this.dlog('collect')
    if (!this.store.getFreeCapacity()) return false

    return this.taskPickupAny() || this.taskWithdrawAny()
    // return this.taskWithdrawAny() || this.taskPickupAny();
  }
}
