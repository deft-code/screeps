import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';
import { LegacyRet } from 'Tasker';

// Flag-team healer; no job spawns it. taskHealRoom is the caboose's and
// drain's too.

declare global {
  interface Creep {
    taskHealRoom(): LegacyRet
  }
}

@injecter(Creep)
export class CreepMedic extends CreepHeal {
  roleMedic () {
    return this.idleRetreat(TOUGH) ||
      this.idleHealNear() ||
      this.taskTask() ||
      this.taskBoostOne() ||
      this.moveRoom(this.team) ||
      this.taskHealTeam() ||
      this.taskHealRoom() ||
      this.moveRange(this.team, {allowHostile: true})
  }

  afterMedic () {
    this.idleHeal()
  }

  idleHealNear () {
    let creep = _(this.room.lookForAtRange(LOOK_CREEPS, this.pos, 1, true))
      .map(spot => spot[LOOK_CREEPS])
      .filter(creep => creep.my && creep.hurts > 0)
      .sortBy(c => -c.hurts)
      .first()

    if (creep) {
      return this.goHeal(creep)
    }
    return false
  }

  taskHealTeam () {
    return this.taskHealCreeps(this.team.creeps)
  }

  taskHealRoom () {
    return this.taskHealCreeps(this.room.find(FIND_MY_CREEPS))
  }

  taskHealCreeps (creeps: Creep[]) {
    const creep = _.find(creeps, c => c.hurts > 0)
    if (!creep) return false
    return this.taskHeal(creep)
  }

  taskHeal (creep?: Creep | null) {
    creep = this.checkId('heal', creep)
    if (!creep || !creep.hurts) return false
    return this.goHeal(creep)
  }
}
