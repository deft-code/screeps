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
    if (!this.pos.inRangeTo(target, 3)) {
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

  taskMassAttackStructs(structType) {
    const s = this.room.find(FIND_HOSTILE_STRUCTURES);
    const targets = _.filter(s, s => s.structureType === structType);
    return this.taskMassAttackStruct(_.sample(targets));
  }

  taskMassAttack(struct) {
    struct = this.checkId('mass attack struct', struct);
    if (this.room.hostiles.length) return false;
    return this.goMassAttack(struct);
  }

  taskRangedAttack(target) {
    target = this.checkId('ranged attack', target);
    return this.goRangedAttack(target);
  }
}

lib.merge(Creep, CreepAttack);