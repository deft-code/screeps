import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team site stomper; no job spawns it.
@injecter(Creep)
export class CreepStomper extends CreepHeal {
  roleStomper () {
    return this.taskTask() || this.moveRoom(this.team) ||
        this.taskStompAll()
  }
}
