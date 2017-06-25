const lib = require('lib');

class CreepRepair {
  idleRepairRoad() {
    if(this.intents.melee || this.intents.range) return false;
    let repair = Game.getObjectById(this.memory.repair);
    this.dlog("idle repair", repair);
    if(!repair || !repair.hurts) {
      this.dlog("New idle road target");
      const power = this.info.repair;
      repair = _.find(
        this.room.lookForAt(LOOK_STRUCTURES, this.pos),
        struct => {
          if(!struct.hurts) return false;
          if(struct.structureType === STRUCTURE_RAMPART) {
            return struct.hits < this.room.wallMax;
          }
          return struct.hurts >= power || this.room.hitsMax < power;
      });
      this.dlog("repair found", repair);
      this.memory.repair = repair && repair.id;
    }
    const what = this.goRepair(repair, false);
    this.dlog("idleRepair", what, repair);
    if(!what) {
      delete this.memory.repair;
    }
    return what;
  }

  idleRepair() {
    this.dlog("start idle repair", this.intents.melee, this.intents.range);
    if(this.intents.melee || this.intents.range) return false;
    let repair = Game.getObjectById(this.memory.repair);
    this.dlog("idle repair", repair);
    if(!repair || !repair.hurts) {
      this.dlog("New idle repair target");
      const power = this.info.repair;
      repair = _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 3, true))
        .map(spot => spot[LOOK_STRUCTURES])
        .find(struct => {
          if(!struct.hurts) return false;
          if(struct.structureType === STRUCTURE_WALL || struct.structureType === STRUCTURE_RAMPART) {
            return struct.hits < this.room.wallMax;
          }
          return struct.hurts >= power || this.room.hitsMax < power;
      });
      this.dlog("repair found", repair);
      this.memory.repair = repair && repair.id;
    }
    const what = this.goRepair(repair, false);
    this.dlog("idleRepair", what, repair);
    if(!what) {
      delete this.memory.repair;
    }
    return what;
  }

  taskRepairOrdered() {
    const decay = this.room.findStructs(
        STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART);

    return this.taskRepairStructs(decay) ||
        this.taskRepairStructs(this.room.find(FIND_STRUCTURES));
  }

  taskRepairRoads() {
    return this.taskRepairStructs(this.room.findStructs(STRUCTURE_ROAD));
  }

  taskRepairStructs(structs) {
    const shuffled = _.shuffle(structs);
    for (let struct of shuffled) {
      switch (struct.structureType) {
        case STRUCTURE_RAMPART:
        case STRUCTURE_WALL:
          if (struct.hits < (0.9 * this.room.wallMax)) {
            return this.taskRepairWall(struct);
          }
          break;
        case STRUCTURE_CONTAINER:
          if (struct.hurts > 100000) {
            return this.taskRepair(struct);
          }
          break;
        case STRUCTURE_ROAD:
          if (struct.hurts >= this.info.repair) {
            return this.taskRepair(struct);
          }
          break;
        default:
          if (struct.hurts > 0) {
            return this.taskRepair(struct);
          }
          break;
      }
    }
    return false;
  }

  taskRepairWall(wall) {
    wall = this.checkId('repair wall', wall);
    if (!wall || wall.hurts <= 0) return false;

    const max = 1.1 * this.room.wallMax;

    if (wall.hits > max) return false;

    return this.goRepair(wall);
  }

  taskTurtleMode() {
    if(this.room.turtle && this.room.enemies.length) {
      console.log(`Turtle Mode ${this.room}`);
      return this.taskTurtle();
    }
    return false;
  }

  taskTurtlePrep() {
    if(this.room.turtle ||
      (this.room.controller.level > 2 && this.room.controller.safeMode)) {
      console.log(`Turtle Prep ${this.room}`);
      return this.taskTurtle();
    }
    return false;
  }

  taskTurtle() {
    let walls = this.room.findStructs(STRUCTURE_WALL, STRUCTURE_RAMPART);
    let wall = _.first(_.sortBy(walls, 'hits'));
    return this.taskRepair(wall);
  }

  taskRepair(struct) {
    struct = this.checkId('repair', struct);
    if (!struct) return false;
    if (!struct.hurts) return false;

    const MAX = 10000;
    if(struct.hurts > MAX) {
      let max = this.memory.task.max;
      if(!max) {
        max = this.memory.task.max = this.hits + MAX;
      }
      if(this.hits > max) return false;
    }

    return this.goRepair(struct);
  }

  goRepair(struct, move = true) {
    const err = this.repair(struct);
    this.dlog(`gorepair ${err}`);
    if (err === OK) {
      this.intents.melee = this.intents.range = struct;
      return struct.hits;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveRange(struct);
    }
    return false;
  }
}

lib.merge(Creep, CreepRepair);
