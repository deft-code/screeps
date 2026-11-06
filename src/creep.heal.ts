import { injecter } from 'roomobj';
import { CreepDismantle } from 'creep.dismantle';
import { healPick, hurtFriendlies } from 'heal';

// Heal tasks of the 2017 roles (guard, medic, wolf, caboose, drain; none
// spawned by a job). Last link of the legacy mixin chain (creep.work.ts):
// the role.*.ts classes extend CreepHeal so `this` sees every legacy
// task; members one role calls on another are declared on the Creep
// interface in the defining module.

@injecter(Creep)
export class CreepHeal extends CreepDismantle {
  // Self first, then an adjacent hurt friendly, then one within ranged
  // reach: fighters (ATTACK or RANGED_ATTACK parts) before civilians, the
  // most hurt first (heal.ts healPick).
  idleHeal() {
    if (!this.intents.canAttack()) return false

    if (this.hurts) {
      return this.goHeal(this, false)
    }

    let creep = healPick(hurtFriendlies(
      this.room.lookForAtRange(LOOK_CREEPS, this.pos, 1, true).map(spot => spot[LOOK_CREEPS])))

    if (creep) {
      return this.goHeal(creep, false)
    }

    if (!this.intents.canRange()) {
      // Overheal
      if (this.room.hostiles.length > 0) {
        return this.goHeal(this, false)
      }
      return false
    }

    creep = healPick(hurtFriendlies(
      this.room.lookForAtRange(LOOK_CREEPS, this.pos, 3, true).map(spot => spot[LOOK_CREEPS])))

    if (creep) {
      return this.goRangedHeal(creep)
    }

    // Overheal
    if (this.room.hostiles.length > 0) {
      return this.goHeal(this, false)
    }

    return false
  }

  goHeal(creep: Creep | null, move = true) {
    if (!creep) return false
    const err = this.heal(creep)
    if (err === OK) {
      this.intents.setAttack(creep)
      move && this.moveBump(creep)
      return creep.hurts
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveNear(creep)
    }
    return false
  }

  goRangedHeal(creep: Creep, move = true) {
    const err = this.rangedHeal(creep)
    if (err === OK) {
      this.intents.setWork(creep)
      return creep.hurts
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveRange(creep)
    }
    return false
  }
}
