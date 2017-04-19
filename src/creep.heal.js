const lib = require('lib');

class CreepHeal {
  goHeal(creep, move = true) {
    const err = this.heal(creep);
    if (err === OK) {
      this.intents.melee = creep;
      return creep.hurts;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(creep);
    }
    return false;
  }

  goRangedHeal(creep, move = true) {
    const err = this.rangeHeal(struct);
    if (err === OK) {
      this.intents.melee = this.intents.range = creep;
      return creep.hurts;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveRange(creep);
    }
    return false;
  }
}

lib.merge(Creep, CreepHeal);
