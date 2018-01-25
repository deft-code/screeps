module.exports = class CreepDismantle {
  idleDismantle () {
    if (this.intents.melee) return false
    if (!this.room.controller) return false
    if (this.room.controller.my) return false
    if (this.room.controller.reservation.username === 'deft-code') return false

    let struct = Game.getObjectById(this.memory.dismantle)
    if (!struct || !this.pos.isNearTo(struct)) {
      struct = _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true))
        .map(spot => spot[LOOK_STRUCTURES])
        .sample()
    }
    if (struct) {
      this.goDismantle(struct, false)
    }
  }

  taskDismantleAny () {
    const target = _(this.room.find(FIND_HOSTILE_STRUCTURES))
                       .sample(3)
                       .sortBy('hits')
                       .first()
    return this.taskDismantle(target)
  }

  taskDismantle (struct) {
    struct = this.checkId('dismantle', struct)

    if (this.carryCapacity && !this.carryFree) {
      this.say('Full')
      return false
    }

    return this.goDismantle(struct)
  }

  goDismantle (struct, move = true) {
    const err = this.dismantle(struct)
    if (err === OK) {
      this.intents.melee = struct
      return struct.hits
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveNear(struct, {allowHostile: true})
    }
    return false
  }
}
