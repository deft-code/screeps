import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team creep driven by console tasks; no job spawns it.
@injecter(Creep)
export class CreepManual extends CreepHeal {
  roleManual () {
    return this.taskTask() || this.movePos(this.team)
  }
}
