import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team healer that trails its team; no job spawns it.
@injecter(Creep)
export class CreepCaboose extends CreepHeal {
  roleCaboose () {
    return this.taskTask() || this.taskCabooseFind() ||
        this.moveNear(this.team) || this.taskHealRoom()
  }

  afterCaboose () {
    this.idleHeal()
  }

  taskCabooseFind () {
    if (this.team.creeps.length < 2) return false

    for (let creep of this.team.creeps) {
      if (creep.name === this.name) continue
      return this.taskCaboose(creep)
    }
    return false
  }

  taskCaboose (creep?: Creep | null) {
    creep = this.checkId('caboose', creep)
    if (!creep) return false
    if (creep.hurts > this.hurts) {
      return this.goHeal(creep)
    }
    return this.moveNear(creep)
  }
}
