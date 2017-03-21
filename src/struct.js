let util = require('util');

util.cachedProp(Structure, 'note', function() {
  return util.structNote(this.structureType, this.pos);
});

function dlog(...args) {
  if(this.debug) {
    const time = ("00" + (Game.time % 1000)).slice(-3);
    console.log(time, util.who(this), ...args);
  }
}

Creep.prototype.dlog = dlog;
Room.prototype.dlog = dlog;
Structure.prototype.dlog = dlog;
Flag.prototype.dlog = dlog;

Object.defineProperty(Structure.prototype, 'repairs', {
  get: function() {
    let myMax = this.hitsMax;
    switch (this.structureType) {
      case STRUCTURE_RAMPART:
      case STRUCTURE_WALL:
        myMax = Math.min(this.hitsMax, this.room.controller.level * 10000 + Math.pow(10,this.room.controller.level-1));
        break;
      case STRUCTURE_ROAD:
        myMax = this.hitsMax / 5;
        break;
    }
    return 1 - (this.hits / myMax);
  }
});
