module.exports = class CreepHeal {
  idleHeal() {
    if (this.intents.melee) return false

    if (this.hurts) {
      return this.goHeal(this, false)
    }

    let creep = _(this.room.lookForAtRange(LOOK_CREEPS, this.pos, 1, true))
      .map(spot => spot[LOOK_CREEPS])
      .filter(creep => creep.my && creep.hurts)
      .sample()

    if (creep) {
      return this.goHeal(creep, false)
    }

    if (this.intents.range) {
      // Overheal
      if (this.room.hostiles.length > 0) {
        return this.goHeal(this, false)
      }
      return false
    }

    creep = _(this.room.lookForAtRange(LOOK_CREEPS, this.pos, 3, true))
      .map(spot => spot[LOOK_CREEPS])
      .filter(creep => creep.my && creep.hurts)
      .sample()

    if (creep) {
      return this.goRangedHeal(creep)
    }

    // Overheal
    if (this.room.hostiles.length > 0) {
      return this.goHeal(this, false)
    }

    return false
  }

  goHeal(creep, move = true) {
    const err = this.heal(creep)
    if (err === OK) {
      this.intents.melee = creep
      move && this.moveBump(creep)
      return creep.hurts
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveNear(creep)
    }
    return false
  }

  goRangedHeal(creep, move = true) {
    const err = this.rangedHeal(creep)
    if (err === OK) {
      this.intents.melee = this.intents.range = creep
      return creep.hurts
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveRange(creep)
    }
    return false
  }
}
