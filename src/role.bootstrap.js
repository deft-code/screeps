import * as routes from 'routes';
module.exports = class CreepBootstrap {
  roleStartup () { return this.roleBootstrap() }
  afterStartup () { return this.afterBootstrap() }

  roleBootstrap () {
    let what = this.idleEmergencyUpgrade() || this.taskTask()
    if (what) return what

    if (!this.atTeam) {
      return this.taskMoveFlag(this.team)
    }

    if (!this.carry.energy) {
      what = this.taskRechargeHarvest()
      if (what) return what
    }

    if (this.room.controller.level < 2) {
      this.dlog('controller override')
      return this.taskUpgradeRoom()
    }

    return this.taskTransferTowers(100) ||
        (this.room.assaulters.length && this.taskTransferTowers(400)) ||
        this.taskTransferPool() ||
        this.taskBuildStructs(STRUCTURE_TOWER) ||
        this.taskTurtleMode() ||
        this.taskBuildOrdered() ||
        this.taskRepairOrdered() ||
        this.taskUpgradeRoom() ||
        this.taskCampSrcs()
  }

  taskRechargeHarvest () {
    // Don't drain Srcs if we're under attack
    if (this.room.memory.thostiles && _.any(this.room.findStructs(STRUCTURE_TOWER), 'energyFree')) {
      return this.taskRechargeLimit(1) ||
        this.taskHarvestSpots()
    }
    return this.taskRechargeLimit(this.carryFree / 3) ||
      this.taskHarvestSpots() ||
      this.taskRechargeLimit(1)
  }

  afterBootstrap () {
    if (this.atTeam) {
      this.idleNom()
      this.idleRecharge()
      this.idleTransferExtra()
      // This drains all energy on Storage and prevents extension filling
      // this.idleBuild() || this.idleRepair()
    } else if (this.carryTotal) {
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

    if (this.carryTotal > this.carryFree) {
      this.idleBuild() || this.idleRepair() || this.idleUpgrade()
    }
    this.idleHarvest()
  }
}
