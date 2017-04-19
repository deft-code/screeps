const lib = require('lib');

class CreepRepair {
  taskRepairOrdered() {
    const decay = this.room.findStructs(
        STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER);

    return this.taskRepairStructs(decay) ||
        this.taskRepairStructs(this.room.find(FIND_STRUCTURES));
  }

  taskRepairRoads() {
    return this.taskRepairStructs(this.room.findStructs(STRUCTURE_ROAD));
  }

  taskRepairStructs(structs, recursing = false) {
    for (let struct of structs) {
      switch (struct.structureType) {
        case STRUCTURE_RAMPART:
        case STRUCTURE_WALL:
          if (struct.hits < (0.9 * this.room.wallMax)) {
            return this.taskRepairWall(struct, recursing);
          }
          break;
        case STRUCTURE_CONTAINER:
          if (struct.hurts > 100000 || (recursing && struct.hurts > 0)) {
            return this.taskRepair(struct, recursing);
          }
          break;
        case STRUCTURE_ROAD:
          if (struct.hits <= 1000 || (recursing && struct.hurts > 0)) {
            return this.taskRepair(struct, recursing);
          }
          break;
        default:
          if (struct.hurts > 0) {
            return this.taskRepair(struct, recursing);
          }
          break;
      }
    }
    return false;
  }

  taskRepairRecurse() {
    const spots = this.room.lookForAtArea(
        LOOK_STRUCTURES, this.pos, 3, true);

    const structs = _.map(spots, spot => spot.structure);

    return this.taskRepairStructs(structs, true);
  }

  taskRepairWall(wall, recursing = false) {
    wall = this.checkId('repair wall', wall);
    if (!wall || !wall.hurts) return false;

    const max = 1.1 * this.room.wallMax;

    if (wall.hits > max) return !recursing && this.taskRepairRecurse();

    return this.goRepair(wall);
  }

  taskRepair(struct, recursing = false) {
    struct = this.checkId('repair', struct);
    if (!struct) return false;

    if (!struct.hurts) return !recursing && this.taskRepairRecurse();

    const what = this.goRepair(struct);
    if (what) {
      this.actionDoubleTime();
    }
    return what;
  }

  goRepair(struct, move=true) {
    const err = this.repair(struct);
    if (err === OK) {
      this.intents.melee = this.intents.range = struct;
      return struct.hits;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveRange(struct);
    }
    return false;
  }
}
