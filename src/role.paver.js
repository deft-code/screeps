module.exports = class Paver {
  rolePaver () {
    const what = this.taskTask()
    if (what) return what

    if (!this.store.energy) {
      return this.taskRechargeHarvest() ||
        this.moveRoom(this.home.controller)
    }

    return this.moveRoom(this.team) ||
      this.taskBuildAny() ||
      this.taskRepairRemote() ||
      this.taskRechargeHarvest()
  }

  afterPaver () {
    this.idleRecharge()
    // this.idleRepairRoad()
    this.idleBuild() || this.idleRepairAny()
  }
}
