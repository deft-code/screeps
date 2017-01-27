
let cache = {};

Room.prototype.calcMatrix = function(name, matrix) {
  const room = Game.rooms[name];
  if(!room) {
    return;
  }

  if(room.controller && !room.controller.my) {
    if(this.matrix) {
      return this.matrix;
    }

    let cached = cache[name];
    if(cached) {
      this.matrix = PathFinder.CostMatrix.deserialize(cached);
      return this.matrix;
    }

    this.matrix = matrix.clone()
    const towers = room.Structures(STRUCTURE_TOWER);
    for(let tower of towers) {
      for(let x = 0; x<50; x++){
        for(let y = 0; y<50; y++){
          const pos = new RoomPosition(x, y, name);
          const range = pos.getRangeTo(tower);
          const extra = Math.min(0, 20 - range)
          this.matrix.set(x, y, this.matrix.get(x, y) + 10 + extra);
        } 
      } 
    }
    cache[name] = m;
    return m;
  }
};

module.exports = {
  upkeep: upkeep,
};
