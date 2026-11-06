import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team road builder; job.paver.ts replaced it.
@injecter(Creep)
export class Paver extends CreepHeal {
  rolePaver () {
    const what = this.taskTask()
    if (what) return what

    if (!this.store.energy) {
      return this.taskRechargeHarvest() ||
        this.moveRoom(this.home.controller || null)
    }

    return this.moveRoom(this.team) ||
      this.taskBuildAny() ||
      this.taskRepairOrdered() ||
      this.taskRechargeHarvest()
  }

  afterPaver () {
    this.idleRecharge()
    // this.idleRepairRoad()
    this.idleBuild() || this.idleRepairAny()
  }
}
