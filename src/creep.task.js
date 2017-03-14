const util = require('util');

Creep.prototype.taskHarvestAny = function(room) {
  if(!room) return false;

  const src = util.pickClosest(this.pos, room.find(FIND_SOURCES_ACTIVE));
  // Too much ping pong when random.
  //const src = _.sample(room.find(FIND_SOURCES_ACTIVE));
  return this.taskHarvest(src);
};

Creep.prototype.taskHarvest = function(src) {
  if (!this.carryFree) return false;

  src = this.taskify('harvest', src);
  if (!src || !src.energy) {
    return false;
  }
  return this.doHarvest(src) && src.energy + 1;
};
