let modutil = require('util');

modutil.cachedProp(Structure, 'note', function() {
  return modutil.structNote(this.structureType, this.pos);
});

Structure.prototype.dismantle = function() {
  this.memory.dismantle = true;
  this.notifyWhenAttacked(false);
  return this.note + JSON.stringify(this.memory);
};

modutil.cachedProp(Source, 'note', function() {
  return modutil.structNote('src', this.pos);
});

function dlog(...args) {
  if(this.debug) {
    const time = ("00" + (Game.time % 1000)).slice(-3);
    console.log(time, modutil.who(this), ...args);
  }
}

Creep.prototype.dlog = dlog;
Room.prototype.dlog = dlog;
Structure.prototype.dlog = dlog;
Flag.prototype.dlog = dlog;

Object.defineProperty(StructureContainer.prototype, 'charger', {
  get: function() {
    if (_.isUndefined(this.memory.source)) {
      let srcs = this.pos.findInRange(FIND_SOURCES, 1);
      let mines = this.pos.findInRange(FIND_MINERALS, 1);
      this.memory.source = srcs.length > 0 || mines.length > 0;
    }
    return this.memory.source;
  }
});

Object.defineProperty(StructureContainer.prototype, 'source', {
  get: function() {
    if (_.isUndefined(this.memory.source)) {
      let srcs = this.pos.findInRange(FIND_SOURCES, 1);
      let mines = this.pos.findInRange(FIND_MINERALS, 1);
      this.memory.source = srcs.length > 0 || mines.length > 0;
    }
    return this.memory.source;
  }
});

Object.defineProperty(StructureLink.prototype, 'source', {
  get: function() {
    if (_.isUndefined(this.memory.source)) {
      let srcs = this.pos.findInRange(FIND_SOURCES, 2);
      this.memory.source = srcs.length > 0;
    }
    return this.memory.source;
  }
});

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
    mem = this.memory || {};
    myMax = Math.max(mem.hitsMax || 0, myMax);
    return 1 - (this.hits / myMax);
  }
});
