const lib = require('lib');

class CreepRepair {
  idleRepair() {
    if(this.intents.melee || this.intents.range) return false;
    let repair = Game.getObjectById(this.memory.repair);
    if(!repair) {
      const power = this.bodyInfo().repair;
      repair = _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 3, true))
        .map(spot => spot[LOOK_STRUCTURES])
        .find(struct => {
          if(struct.structureType === STRUCTURE_WALL || struct.structureType === STRUCTURE_RAMPART) {
            return struct.hits < this.room.wallMax;
          }
          return this.hurts >= power || this.hitsMax > power;
      });
      this.memory.repair = repair && repair.id;
    }
    const what = this.goRepair(repair, false);
    if(!what) {
      delete this.memory.repair;
    }
    return what;
  }

  taskRepairOrdered() {
    const decay = this.room.findStructs(
        STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER);

    return this.taskRepairStructs(decay) ||
        this.taskRepairStructs(this.room.find(FIND_STRUCTURES));
  }

  taskRepairRoads() {
    return this.taskRepairStructs(this.room.findStructs(STRUCTURE_ROAD));
  }

  taskRepairStructs(structs) {
    for (let struct of structs) {
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
          if (struct.hits <= 1000) {
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
    if (!wall || !wall.hurts) return false;

    const max = 1.1 * this.room.wallMax;

    if (wall.hits > max) return false;

    return this.goRepair(wall);
  }

  taskRepair(struct) {
    struct = this.checkId('repair', struct);
    if (!struct) return false;
    if (!struct.hurts) return false;

    return this.goRepair(struct);
  }

  goRepair(struct, move = true) {
    const err = this.repair(struct);
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
