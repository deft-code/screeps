module.exports = class CreepFarmer {
  roleFarmer () {
    const what = this.idleRetreat(WORK) ||
      this.fleeHostiles() ||
      this.idleEmergencyUpgrade() ||
      this.taskTask()
    if (what) return what

    if (this.pos.roomName === this.dropRoom().name) {
      if (this.store.getUsedCapacity()) {
        return this.taskTransferResources() ||
          this.taskBuildOrdered() ||
          this.taskRepairOrdered() ||
          this.goUpgradeController(this.room.controller)
      }
      return this.taskMoveFlag(this.team)
    }

    if (this.pos.roomName === this.team.pos.roomName) {
      return this.taskFarm() || this.taskMoveRoom(this.dropRoom().controller)
    }

    return this.taskMoveFlag(this.team)
  }

  afterFarmer () {
    this.idleNom()
    this.idleBuild() || this.idleRepairAny() || this.idleUpgrade()
  }

  findDropRoom () {
    let minD = Infinity
    let minE = Infinity

    let room = this.home

    for (const rName in Game.rooms) {
      const r = Game.rooms[rName]

      if (!r.base) continue
      if (!r.controller || !r.controller.my) continue

      const d = Game.map.findRoute(this.room, r).length
      if (d > minD) continue

      const e = (r.storage && r.storage.store.energy) || 0
      if (d === minD && e >= minE) continue

      minD = d
      minE = e
      room = r
    }
    return room
  }

  dropRoom () {
    let room = Game.rooms[this.memory.dropRoom]
    if (!room) {
      room = this.findDropRoom()
      this.memory.dropRoom = room.name
    }
    return room
  }

  taskFarm () {
    if (!this.store.getFreeCapacity()) return false

    return this.taskCollect() || this.taskHarvestSpots()
  }
}
