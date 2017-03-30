Creep.prototype.taskRepairOrdered = function() {
  return this.taskRepairRoom() || this.taskRepairRoads() ||
      this.taskRepairWalls();
};

Creep.prototype.taskRepairWalls = function() {
  if (!this.teamRoom) return false;

  const max = 0.9 * this.teamRoom.wallMax;

  const wall = _.find(
      this.teamRoom.findStructs(STRUCTURE_WALL, STRUCTURE_RAMPART),
      wall => wall.hits < max);

  return this.taskRepairWall(wall);
};

Creep.prototype.taskRepairWall = function(wall) {
  wall = this.checkId('repair wall', wall);
  if (!wall || !wall.hurts) return false;

  const max = 1.1 * this.teamRoom.wallMax;

  if (wall.hits > max) return false;

  return this.doRepair(wall);
};

Creep.prototype.taskRepairRoom = function() {
  if (!this.teamRoom) return false;

  const struct = _.find(
      this.teamRoom.find(FIND_STRUCTURES),
      s => s.hurts && s.structureType !== STRUCTURE_WALL &&
          s.structureType !== STRUCTURE_RAMPART &&
          s.structureType !== STRUCTURE_ROAD);

  return this.taskRepair(struct);
};

Creep.prototype.taskRepairRoads = function() {
  if (!this.teamRoom) return false;

  const road = _.find(
      this.teamRoom.findStructs(STRUCTURE_ROAD), road => road.hits < 1000);

  return this.taskRepair(road);
};

Creep.prototype.taskRepairNear = function(again = true) {
  if (!this.teamRoom) return false;

  const struct = _.min(
      _.filter(
          this.teamRoom.find(FIND_STRUCTURES),
          s => s.hurts && s.structureType !== STRUCTURE_WALL &&
              s.structureType !== STRUCTURE_RAMPART &&
              this.pos.inRangeTo(s, 3)),
      'hits');
  return this.taskRepair(struct, again);
};

Creep.prototype.taskRepair = function(struct, again = true) {
  struct = this.checkId('repair', struct);
  if (!struct) return false;

  if (!struct.hurts) return this.taskRepairNear(false);

  const what = this.doRepair(struct);
  if (what) {
    this.actionDoubleTime();
  }
  return what;
};
