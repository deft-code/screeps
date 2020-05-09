module.exports = class CreepOldRepair {
  idleRepairRoad () {
    if (this.room.controller && this.room.controller.my && this.room.controller.level >= 3) return false
    if (this.intents.melee || this.intents.range) return false
    let repair = Game.getObjectById(this.memory.repair)
    this.dlog('idle repair', repair)
    if (!repair || !repair.hurts) {
      this.dlog('New idle road target')
      const power = this.info.repair
      repair = _.find(
        this.room.lookForAt(LOOK_STRUCTURES, this.pos),
        struct => {
          if (!struct.hurts) return false
          if (struct.structureType === STRUCTURE_RAMPART) {
            return struct.hits < this.room.wallMax
          }
          return struct.hurts >= power || this.room.hitsMax < power
        })
      this.dlog('repair found', repair)
      this.memory.repair = repair && repair.id
    }
    const what = this.goRepair(repair, false)
    this.dlog('idleRepair', what, repair)
    if (!what) {
      delete this.memory.repair
    }
    return what
  }

  taskRepairRemote () {
    return this.taskRepairStructs(this.room.findStructs(STRUCTURE_ROAD, STRUCTURE_CONTAINER))
  }

  taskRepairWall (wall) {
    wall = this.checkId('repair wall', wall)
    if (!wall || wall.hurts <= 0) return false

    const max = 1.1 * this.room.wallMax

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
    if (this.room.turtle ||
      (this.room.controller.level > 2 && this.room.controller.safeMode)) {
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
