const lib = require('lib');

function calcMatrix(name, matrix) {
  const room = Game.rooms[name];
  Memory.matrix = Memory.matrix || {};
  if (!room) {
    let cached = Memory.matrix[name];
    if (cached) {
      return PathFinder.CostMatrix.deserialize(cached);
    }
    return;
  }

  if (room.controller && !room.controller.my) {
    if (this.matrix) {
      return this.matrix;
    }

    this.matrix = matrix;
    const towers = room.findStructs(STRUCTURE_TOWER);
    for (let tower of towers) {
      for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
          const pos = new RoomPosition(x, y, name);
          const range = pos.getRangeTo(tower);
          const extra = Math.min(0, 20 - range);
          this.matrix.set(x, y, this.matrix.get(x, y) + 10 + extra);
        }
      }
    }
    Memory.matrix[name] = this.matrix.serialize();
  }
};



class CreepStall {
  runStall() {
    const stall = this.memory.stall = this.memory.stall || {};
    if(stall.x !== this.pos.x || stall.y !== this.pos.y) {
      stall.x = this.pos.x;
      stall.y = this.pos.y;
      stall.t = Game.time;
      return false;
    }
    return true;
  }

  get stallTicks() {
    const stallT = (this.memory.stall || {}).t || Game.time;
    return Game.time - stallT;
  }
}
lib.merge(Creep, CreepStall);

module.exports = {
  calcMatrix: calcMatrix,
};
