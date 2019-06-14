import { CreepMove } from "creep.move";
import * as debug from "debug";

export class RoleRecycle extends CreepMove {
  roleRecycle() {
    return this.idleRecycle()
  }

  idleRecycle() {
    const spawn = this.pos.findClosestByRange(this.room.findStructs(STRUCTURE_SPAWN))
    if (!spawn) {
      debug.log(this, 'BAD spawn', this.memory.spawn)
      return false
    }

    const err = spawn.recycleCreep(this)
    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(spawn)
    }
    console.log(`RECYCLE! ${err}, ${this}, ${spawn}`)
    return false
  }

}