import { injecter } from 'roomobj';
import { CreepOldRepair } from 'creep.oldrepair';

// Attack tasks of the 2017 fighters (guard, wolf, archer, defender; none
// spawned by a job). Third link of the legacy mixin chain (creep.work.ts).

type Target = Creep | AnyStructure | StructureInvaderCore

@injecter(Creep)
export class CreepAttack extends CreepOldRepair {
  goRangedAttack (target: Target | null, move = true) {
    if (!target) return false
    const err = this.rangedAttack(target)
    if (err === OK) {
      this.intents.setRange(target)
      return target.hits
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.moveRange(target, {allowHostile: true})
    }
    return false
  }

  goMassAttack (target: Target, move = true) {
    if (!this.pos.inRangeTo(target, 3)) {
      return move && this.moveNear(target)
    }
    const err = this.rangedMassAttack()
    if (err !== OK) return false

    this.intents.setRange('mass attack')
    return this.intents.range
  }

  idleAttack () {
    if (!this.intents.canAttack()) return false

    const creep = this.pos.findClosestByRange(this.room.enemies)
    if (creep && this.pos.isNearTo(creep)) {
      this.goAttack(creep, false)
    }
    return false
  }

  taskAttack (creep?: Target | null) {
    creep = this.checkId('attack', creep)
    this.dlog("attacking", creep);
    if (!creep) return false
    return this.goAttack(creep)
  }

  goAttack (target: Target | null, move = true) {
    if (!target) return false
    const err = this.attack(target)
    if (err === OK) {
      move && this.moveBump(target)
      this.intents.setAttack(target)
      return target.id;
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.moveNear(target)
    }
    return false
  }

  taskMassAttackStructs (structType: StructureConstant) {
    const s = this.room.find(FIND_HOSTILE_STRUCTURES)
    const targets = _.filter(s, s => s.structureType === structType)
    return this.taskMassAttack(_.sample(targets))
  }

  taskMassAttack (struct?: AnyStructure | null) {
    struct = this.checkId('mass attack', struct)
    if (this.room.hostiles.length) return false
    if (!struct) return false
    return this.goMassAttack(struct)
  }

  taskRangedAttack (target?: Target | null) {
    target = this.checkId('ranged attack', target)
    return this.goRangedAttack(target)
  }
}
