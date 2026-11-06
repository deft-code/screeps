import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepAttack } from 'creep.attack';

// Dismantle tasks of the 2017 wreckers (bulldozer, ram, cleaner; none
// spawned by a job). Fourth link of the legacy mixin chain (creep.work.ts).

@injecter(Creep)
export class CreepDismantle extends CreepAttack {
  idleDismantle () {
    if (!this.intents.canAttack()) return false
    if (!this.room.controller) return false
    if (this.room.controller.my) return false
    if (this.room.controller.reservation?.username === 'deft-code') return false

    let struct = lib.byId<Structure>(this.memory.dismantle)
    if (!struct || !this.pos.isNearTo(struct)) {
      struct = _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true))
        .map(spot => spot[LOOK_STRUCTURES])
        .sample()
    }
    if (struct) {
      this.goDismantle(struct, false)
    }
    return false
  }

  taskDismantleAny () {
    const target = _(this.room.find(FIND_HOSTILE_STRUCTURES))
                       .sample(3)
                       .sortBy('hits')
                       .first()
    return this.taskDismantle(target)
  }

  taskDismantle (struct?: Structure | null) {
    struct = this.checkId('dismantle', struct)

    if (this.carryCapacity && !this.store.getFreeCapacity()) {
      this.say('Full')
      return false
    }

    if (!struct) return false
    return this.goDismantle(struct)
  }

  goDismantle (struct: Structure, move = true) {
    const err = this.dismantle(struct)
    if (err === OK) {
      this.intents.setAttack(struct)
      return struct.hits
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveNear(struct, {allowHostile: true})
    }
    return false
  }
}
