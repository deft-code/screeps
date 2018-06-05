module.exports = class CreepZombieFarmer {
  roleZombiefarmer () {
    let what = this.idleRetreat(CARRY) || this.taskTask()
    if (what) return what

    if (this.carryFree) {
      what = this.taskPickupAny()
      if (what) return what
    }

    if (this.atTeam && ((this.carryFree && this.ticksToLive > 200) || !this.carryTotal)) {
      return this.taskPickupAny() || this.taskZFarm()
      // return this.taskZFarm()
    }

    if (this.carryTotal) {
      if (this.pos.roomName === this.home.name) {
        return this.taskTransferResources()
      }
      return this.taskMoveRoom(this.home.controller)
    }

    return this.moveRoom(this.team)
  }

  taskZFarm () {
    if (this.room.storage && !this.room.storage.storeFree) {
      return this.taskWithdrawResource(this.room.storage)
    }
    if (this.room.terminal && !this.room.terminal.storeFree) {
      return this.taskWithdrawResource(this.room.terminal)
    }
    const m = _.find(
      _.shuffle(this.room.find(FIND_HOSTILE_STRUCTURES).slice()),
      s => s.store && ((s.storeTotal - s.store.energy) > 0 || s.store.energy > 1500))
    if (m) {
      return this.taskWithdrawResource(m)
    }
  }

  afterZombiefarmer () {
    this.idleNomNom()
  }
}
