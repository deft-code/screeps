const lib = require('lib');

class CreepDismantle {
  taskDismantleAny() {
    const target = _(this.room.find(FIND_HOSTILE_STRUCTURES))
                       .sample(3)
                       .sortBy('hits')
                       .first();
    return this.taskDismantle(target);
  }

  taskDismantle(struct, drop = true) {
    struct = this.checkId('dismantle', struct);
    drop = this.checkOther('drop', drop);

    if (this.carryCapacity && !this.carryFree && !drop) {
      this.say('Full');
      return false;
    }
    return this.goDismantle(struct)
  }

  goDismantle(struct, move = true) {
    const err = this.dismantle(struct);
    if (err === OK) {
      this.intents.melee = struct;
      return struct.hits;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(struct, {allowHostile:true});
    }
    return false;
  }
}

lib.merge(Creep, CreepDismantle);