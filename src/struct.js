const util = require('util');
const lib = require('lib');

class StructureExtra {
  get note() {
    return util.structNote(this.structureType, this.pos);
  }

  get energyFree() {
    return Math.max(0, this.energyCapacity - this.energy);
  }

  get obstacle() {
    return _.contains(OBSTACLE_OBJECT_TYPES, this.structureType);
  }

  get hurts() {
    return this.hitsMax - this.hits;
  }

  get repairs() {
    let myMax = this.hitsMax;
    switch (this.structureType) {
      case STRUCTURE_RAMPART:
      case STRUCTURE_WALL:
        myMax = Math.min(
            this.hitsMax,
            this.room.controller.level * 10000 +
                Math.pow(10, this.room.controller.level - 1));
        break;
      case STRUCTURE_ROAD:
        myMax = this.hitsMax / 5;
        break;
    }
    return 1 - (this.hits / myMax);
  }
}

lib.merge(Structure, StructureExtra);

function dlog(...args) {
  if (this.debug) {
    const time = ('00' + (Game.time % 1000)).slice(-3);
    console.log(time, util.who(this), ...args);
  }
}

Creep.prototype.dlog = dlog;
Room.prototype.dlog = dlog;
Structure.prototype.dlog = dlog;
Flag.prototype.dlog = dlog;
