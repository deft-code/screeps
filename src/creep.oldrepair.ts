import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepWork } from 'creep.work';

// Road and wall repair tasks of 2020: taskTurtle* are called by worker and
// bootstrap (live); idleRepairRoad and taskRepairWall only by dead roles.
// Second link of the legacy mixin chain (see creep.work.ts).

declare global {
  interface Room {
    // Nothing sets these (docs/known-issues.md): the comparisons below
    // see undefined/NaN and fail, as they always have. Typed optional so
    // that reads as written.
    turtle?: boolean
    wallMax?: number
    hitsMax?: number
  }
}

@injecter(Creep)
export class CreepOldRepair extends CreepWork {
  idleRepairRoad () {
    if (this.room.controller && this.room.controller.my && this.room.controller.level >= 3) return false
    if (!this.intents.canWork()) return false
    let repair = lib.byId<Structure>(this.memory.repair)
    this.dlog('idle repair', repair)
    if (!repair || !repair.hurts) {
      this.dlog('New idle road target')
      const power = this.info.repair
      repair = _.find(
        this.room.lookForAt(LOOK_STRUCTURES, this.pos),
        struct => {
          if (!struct.hurts) return false
          if (struct.structureType === STRUCTURE_RAMPART) {
            return struct.hits < (this.room.wallMax ?? NaN)
          }
          return struct.hurts >= power || (this.room.hitsMax ?? NaN) < power
        }) || null
      this.dlog('repair found', repair)
      this.memory.repair = repair ? repair.id : undefined
    }
    const what = this.goRepair(repair, false)
    this.dlog('idleRepair', what, repair)
    if (!what) {
      delete this.memory.repair
    }
    return what
  }

  taskRepairWall (wall?: Structure | null) {
    wall = this.checkId('repair wall', wall)
    if (!wall || wall.hurts <= 0) return false

    const max = 1.1 * (this.room.wallMax ?? NaN)

    if (wall.hits > max) return false

    return this.goRepair(wall)
  }

  taskTurtleMode () {
    if (this.room.turtle && this.room.enemies.length) {
      console.log(`Turtle Mode ${this.room}`)
      return this.taskTurtle()
    }
    return false
  }

  taskTurtlePrep () {
    const ctrl = this.room.controller
    if (this.room.turtle ||
      (ctrl && ctrl.level > 2 && ctrl.safeMode)) {
      console.log(`Turtle Prep ${this.room}`)
      return this.taskTurtle()
    }
    return false
  }

  taskTurtle () {
    let walls = this.room.findStructs(STRUCTURE_WALL, STRUCTURE_RAMPART)
    let wall = _.first(_.sortBy(walls, 'hits'))
    return this.taskRepair(wall)
  }
}
