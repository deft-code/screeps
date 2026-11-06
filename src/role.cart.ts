import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team remote farmer/hauler; no job spawns it.
@injecter(Creep)
export class CreepCart extends CreepHeal {
  roleCart () {
    const what = this.idleRetreat(WORK) ||
      this.fleeHostiles() ||
      this.idleEmergencyUpgrade() ||
      this.taskTask()
    if (what) return what

    const dropRoom = this.dropRoom()
    if (this.store.getFreeCapacity() < this.store.getUsedCapacity() ||
      (this.room.name === dropRoom.name && this.store.getUsedCapacity())) {
      return this.moveRoom(dropRoom.storage || dropRoom.controller || null) ||
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
