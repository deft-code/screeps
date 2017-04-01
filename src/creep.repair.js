Creep.prototype.taskRepairOrdered = function() {
  if (!this.teamRoom) return false;

  const decay = this.teamRoom.findStructs(
      STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER);

  return this.taskRepairStructs(decay) ||
      this.taskRepairStructs(this.teamRoom.find(FIND_STRUCTURES));
};

Creep.prototype.taskRepairRoads = function() {
  if (!this.teamRoom) return false;
  return this.taskRepairStructs(this.teamRoom.findStructs(STRUCTURE_ROAD));
};

Creep.prototype.taskRepairStructs = function(structs, recurse = false) {
  for (let struct of structs) {
    switch (struct.structureType) {
      case STRUCTURE_RAMPART:
      case STRUCTURE_WALL:
        if (this.teamRoom && struct.hits < (0.9 * this.teamRoom.wallMax)) {
          return this.taskRepairWall(struct, again);
        }
        break;
      case STRUCTURE_CONTAINER:
        if (struct.hurts > 100000 || (recurse && struct.hurts > 0)) {
          return this.taskRepair(struct, again);
        }
        break;
      case STRUCTURE_ROAD:
        if (struct.hits < 1000 || (recurse && struct.hurts > 0)) {
          return this.taskRepair(struct, again);
        }
        break;
      default:
        if (struct.hurts > 0) {
          return this.taskRepair(struct, again);
        }
        break;
    }
  }
  return false;
};

Creep.prototype.taskRepairRecurse = function() {
  if (!this.teamRoom) return false;

  const p = this.pos;
  const spots = this.room.lookForAtArea(
      LOOK_STRUCTURES, p.y - 3, p.x - 3, p.y + 3, p.x + 3, true);

  const structs = _.map(spots, spot => spot.structure);

  return this.taskRepairStructs(structs, false);
};

Creep.prototype.taskRepairWall = function(wall, recurse = false) {
  wall = this.checkId('repair wall', wall);
  if (!wall || !wall.hurts) return false;

  const max = 1.1 * this.teamRoom.wallMax;

  if (wall.hits > max) return !recurse && this.taskRepairRecurse();

  return this.doRepair(wall);
};

Creep.prototype.taskRepair = function(struct, recurse = false) {
  struct = this.checkId('repair', struct);
  if (!struct) return false;

  if (!struct.hurts) return !recurse && this.taskRepairRecurse();

  const what = this.doRepair(struct);
  if (what) {
    this.actionDoubleTime();
  }
  return what;
};
