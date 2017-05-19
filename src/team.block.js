const lib = require('lib');

Flag.prototype.teamBlock = function() {
  return this.upkeepRole(4, {role:'block', body:'scout'}, 5, this.closeSpawn());
  let num = 1;
  if(this.room) {
    let p = lib.roomposFromMem(this.memory.pos);
    if(!p) {
      p = this.memory.pos = this.pos;
    }
    let src = Game.getObjectById(this.memory.src);
    if(!src) {
      src = this.pos.findClosestByRange(this.room.find(FIND_SOURCES));
      this.memory.src = src.id;
    }
    num = src.spots.length;
  }
  this.dlog(`${num} blockers`);
  return this.upkeepRole(num, {role: 'block', body: 'scout'}, 5, this.closeSpawn());
};
