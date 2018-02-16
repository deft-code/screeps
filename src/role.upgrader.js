module.exports = class CreepUpgrader {
  roleUpgrader () {
    let what = this.taskTask()
    if (what) return what

    if (this.carry.energy) {
      return this.goUpgradeController(this.room.controller)
    }
    return this.taskRechargeHarvest()
  }

  afterUpgrader () {
    this.idleNom()
    this.idleRecharge()
    if (this.pos.inRangeTo(this.room.controller, 4)) {
      this.idleNom()
    }
  }
}
