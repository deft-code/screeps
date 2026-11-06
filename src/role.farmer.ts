import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';
import { LegacyRet } from 'Tasker';

// Flag-team remote harvester hauling home; job.farmer.ts replaced it.
// dropRoom and taskFarm are shared by cart and collector.

declare global {
  interface Room {
    // Never set by anything; findDropRoom's filter sees undefined.
    base?: boolean
  }
  interface Creep {
    dropRoom(): Room
    taskFarm(): LegacyRet
  }
}

@injecter(Creep)
export class CreepFarmer extends CreepHeal {
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
      return this.taskFarm() || this.taskMoveRoom(this.dropRoom().controller || null)
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

      const route = Game.map.findRoute(this.room, r)
      if (!_.isArray(route)) continue
      const d = route.length
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
    let room = this.memory.dropRoom ? Game.rooms[this.memory.dropRoom] : undefined
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
