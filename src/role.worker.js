module.exports = class CreepWorker {
  roleWorker () {
    this.dlog('worker!')
    let what = this.idleEmergencyUpgrade() || this.taskTask() || this.moveRoom(this.team)
    if (what) return what

    const upgrade = !this.room.storage || this.room.storage.store.energy > 10000

    this.dlog('upgrade!', upgrade)

    if (this.carry.energy) {
      return this.taskBuildStructs(STRUCTURE_TOWER) ||
        this.taskTurtleMode() ||
        this.taskBuildOrdered() ||
        this.taskRepairOrdered() ||
        this.taskTurtlePrep() ||
        this.taskTurtle() ||
        (upgrade && this.goUpgradeController(this.room.controller))
    }
    return this.taskRechargeHarvest()
  }

  afterWorker () {
    this.idleNom()
    this.idleRecharge()
    if (this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair() || this.idleUpgrade()
    }
  }
}
