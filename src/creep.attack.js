const lib = require('lib');

class CreepAttack {
  goRangedAttack(target, move=true) {
    const err = this.rangedAttack(target);
    if (err === OK) {
      this.intents.range = target;
      return target.hits;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveRange(target);
    }
    return false;
  }

  goMassAttack() {
    const err = this.rangedMassAttack();
    if (err === OK) {
      return this.intents.range = 'mass attack';
    }
    return false;
  }

  goAttack(target, move=true) {
    const err = this.attack(target);
    if (err === OK) {
      return this.intents.melee = target;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(target);
    }
    return false;
  }
}

lib.merge(Creep, CreepAttack);


