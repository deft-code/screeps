module.exports = class CreepCart {
  roleCart () {
    const what = this.idleRetreat(WORK) ||
      this.fleeHostiles() ||
      this.idleEmergencyUpgrade() ||
      this.taskTask()
    if (what) return what

    const dropRoom = this.dropRoom()
    if (this.store.getFreeCapacity() < this.store.getUsedCapacity() ||
      (this.room.name === dropRoom.name && this.store.getUsedCapacity())) {
      return this.moveRoom(dropRoom.storage || dropRoom.controller) ||
          this.taskTransferResources() ||
          this.taskBuildOrdered() ||
          this.taskRepairOrdered() ||
          this.goUpgradeController(this.room.controller)
    }

    return this.moveRoom(this.team) ||
      this.taskFarm() ||
      this.taskCampSrcs()
  }

  afterCart () {
    this.idleNom()
    if (this.store.energy) {
      this.idleBuild() || this.idleRepairRoad()
      if (this.atTeam) {
        this.idleRecharge()
      } else {
        this.idleTransferAny()
      }
    }
  }
}
