
Creep.prototype.getCostMatrix(roomName) = function() {
  const info = this.bodyInfo;
  const needRoad = info.weight * 2 > info.fatigue;

  const needRoad = this.body.length <= this.getActiveBodyParts(MOVE) * 2;

  const dpt = this.getActiveBodyParts(WORK) * 50 +
      this.getActiveBodyParts(ATTACK) * 30 +
      this.getActiveBodyParts(RANGED_ATTACK) * 10;

  const total = this.ticksToLive * dpt;

};
CostMatrix.Get = function(roomName) {
  const matrices = Memory.Matrices = Memory.Matrices || {};
  const matrix = matrices[roomName] = matrices[roomName] || {};
}


function calcMatrix(name, matrix) {
  const room = Game.rooms[name];
  Memory.matrix = Memory.matrix || {};
  if(!room) {
    let cached = Memory.matrix[name];
    if(cached) {
      return PathFinder.CostMatrix.deserialize(cached);
    }
    return;
  }

  if(room.controller && !room.controller.my) {
    if(this.matrix) {
      return this.matrix;
    }

    this.matrix = matrix;
    const towers = room.Structures(STRUCTURE_TOWER);
    for(let tower of towers) {
      for(let x = 0; x<50; x++){
        for(let y = 0; y<50; y++){
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

module.exports = {
  calcMatrix: calcMatrix,
};
