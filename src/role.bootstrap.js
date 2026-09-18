import * as routes from 'routes';
module.exports = class CreepBootstrap {
  roleStartup() { return this.roleBootstrap() }
  afterStartup() { return this.afterBootstrap() }
  // Pioneer (job.pioneer.ts): a startup for another room, laid by ms.startup.ts.
  rolePioneer() { return this.roleBootstrap() }
  afterPioneer() { return this.afterBootstrap() }

  roleBootstrap() {
    let what = this.idleEmergencyUpgrade() || this.taskTask()
    if (what) return what

    if (!this.atHome) {
      // `home` falls back to the current room without vision of memory.home,
      // which parked pioneers on the wrong controller; head for the room itself.
      const home = Game.rooms[this.memory.home]
      if (home && home.controller) return this.taskMoveRoom(home.controller)
      return this.moveRoom({ pos: new RoomPosition(25, 25, this.memory.home) })
    }

    if (!this.store.energy) {
      what = this.taskRechargeHarvest()
      if (what) return what
    }

    // Only in a room we own: a pioneer sent ahead of the claim (ms.startup.ts)
    // cannot upgrade, and returning here would keep it from ever building.
    if (this.home.controller.my && this.home.controller.level < 2) {
      this.dlog('controller override')
      return this.taskUpgradeRoom()
    }

    return this.taskTransferTowers(100) ||
      (this.room.assaulters.length && this.taskTransferTowers(400)) ||
      this.taskTransferPool() ||
      this.taskBuildStructs(STRUCTURE_TOWER) ||
      this.taskTurtleMode() ||
      this.taskBuildOrdered() ||
      this.taskRepairHurt() ||
      this.taskUpgradeRoom() ||
      this.taskRepairOrdered() ||
      this.taskCampSrcs()
  }

  taskRechargeHarvest() {
    // Don't drain Srcs if we're under attack
    if (this.room.memory.thostiles && _.any(this.room.findStructs(STRUCTURE_TOWER), s => s.store.getFreeCapacity(RESOURCE_ENERGY))) {
      return this.taskRechargeLimit(1) ||
        this.taskHarvestSpots()
    }
    return this.taskRechargeLimit(this.store.getFreeCapacity() / 3) ||
      this.taskHarvestSpots() ||
      this.taskRechargeLimit(1)
  }

  afterBootstrap() {
    if (true || this.atTeam) {
      this.idleNom()
      this.idleRecharge()
      this.idleTransferExtra()
      // This drains all energy on Storage and prevents extension filling
      // this.idleBuild() || this.idleRepairAny()
    } else if (this.store.getUsedCapacity()) {
      if (routes.dist(this.team.pos.roomName, this.room.name) > 1) {
        this.drop(RESOURCE_ENERGY)
        this.say('Dump!')
      } else {
        if (Game.time % 2 === 0) {
          this.say('I think')
        } else {
          this.say('I can')
        }
      }
    }

    if (this.store.getUsedCapacity() > this.store.getFreeCapacity()) {
      this.idleBuild() || this.idleRepairAny() || this.idleUpgrade()
    }
    this.idleHarvest()
  }
}
