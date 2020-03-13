module.exports = class CreepAttack {
  goRangedAttack (target, move = true) {
    const err = this.rangedAttack(target)
    if (err === OK) {
      this.intents.range = target
      return target.hits
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.moveRange(target, {allowHostile: true})
    }
    return false
  }

  goMassAttack (target, move = true) {
    if (!this.pos.inRangeTo(target, 3)) {
      return move && this.moveNear(target)
    }
    const err = this.rangedMassAttack()
    if (err !== OK) return false

    if (err === OK) {
      this.intents.range = 'mass attack'
      return this.intents.range
    }
    return false
  }

  idleAttack () {
    if (this.intents.melee) return false

    const creep = this.pos.findClosestByRange(this.room.enemies)
    if (creep && this.pos.isNearTo(creep)) {
      this.goAttack(creep, false)
    }
  }

  taskAttack (creep) {
    creep = this.checkId('attack', creep)
    this.dlog("attacking", creep);
    if (!creep) return false
    return this.goAttack(creep)
  }

  goAttack (target, move = true) {
    const err = this.attack(target)
    if (err === OK) {
      move && this.moveBump(target)
      this.intents.melee = target
      return target.id;
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.moveNear(target)
    }
    return false
  }

  taskMassAttackStructs (structType) {
    const s = this.room.find(FIND_HOSTILE_STRUCTURES)
    const targets = _.filter(s, s => s.structureType === structType)
    return this.taskMassAttack(_.sample(targets))
  }

  taskMassAttack (struct) {
    struct = this.checkId('mass attack', struct)
    if (this.room.hostiles.length) return false
    return this.goMassAttack(struct)
  }

  taskRangedAttack (target) {
    target = this.checkId('ranged attack', target)
    return this.goRangedAttack(target)
  }
}
