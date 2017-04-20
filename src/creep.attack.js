const lib = require('lib');

class CreepAttack {
  goRangedAttack(target, move = true) {
    const err = this.rangedAttack(target);
    if (err === OK) {
      this.intents.range = target;
      return target.hits;
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.idleMoveRange(target);
    }
    return false;
  }

  goMassAttack(target, move = true) {
    if(!this.pos.inRangeTo(target, 3)) {
      return move && this.idleMoveNear(target);
    }
    const err = this.rangedMassAttack();
    if (err === OK) {
      return this.intents.range = 'mass attack';
    }
    return false;
  }

  goAttack(target, move = true) {
    const err = this.attack(target);
    if (err === OK) {
      return this.intents.melee = target;
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.idleMoveNear(target);
    }
    return false;
  }
}

lib.merge(Creep, CreepAttack);
