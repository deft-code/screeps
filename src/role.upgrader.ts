import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team upgrader that harvests its own energy; job.upgrader.ts (the
// storage-surplus sink) is the live one and does not use this.
@injecter(Creep)
export class CreepUpgrader extends CreepHeal {
  roleUpgrader () {
    let what = this.taskTask()
    if (what) return what

    if (this.store.energy) {
      return this.goUpgradeController(this.room.controller)
    }
    return this.taskRechargeHarvest()
  }

  afterUpgrader () {
    this.idleNom()
    this.idleRecharge()
    if (this.room.controller && this.pos.inRangeTo(this.room.controller, 4)) {
      this.idleNom()
    }
  }
}
