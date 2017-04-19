const lib = require('lib');

class CreepDismantle {
  taskDismantleAny() {
    const target = _(this.room.find(FIND_HOSTILE_STRUCTURES))
                       .sample(3)
                       .sortBy('hits')
                       .first();
    return this.taskDismantle(target, true);
  }

  taskDismantle(struct, drop) {
    struct = this.checkId('dismantle', struct);
    drop = this.checkOther('drop', drop);

    if (this.carryCapacity && !this.carryFree && !this.memory.task.drop) {
      this.say('Full');
      return false;
    }
    return this.goDismantle(structure)
  }

  goDismantle(struct, move = true) {
    const err = this.dismantle(struct);
    if (err === OK) {
      this.intents.melee = struct;
      return struct.hits;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(struct);
    }
    return false;
  }
}
