import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// A tiny bootstrap ([WORK, CARRY, MOVE]) for a room that fell over.
@injecter(Creep)
export class CreepReboot extends CreepHeal {
  roleReboot () {
    return this.roleBootstrap()
  }

  afterReboot () {
    return this.afterBootstrap()
  }
}
