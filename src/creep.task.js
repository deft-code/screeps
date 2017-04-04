const util = require('util');

Creep.prototype.taskHarvestAny = function() {
  if(!this.atTeam) return false;
  return this.taskHarvest(this.pickSrc());
};

Creep.prototype.taskHarvest = function(src) {
  if (!this.carryFree) return false;
  src = this.checkId('harvest', src);
  return this.doHarvest(src) && src.energy + 1;
};

Creep.prototype.pickSrc = function() {
  let srcs = this.room.find(FIND_SOURCES_ACTIVE);
  if(!srcs.length) {
    srcs = this.room.find(FIND_SOURCES);
  }
  if(srcs.length === 1) return _.first(srcs);

  let min = 100;
  let minSrc = null;
  let range = 100;
  for(let src of srcs) {
    const spots = this.room.lookForAtRange(LOOK_CREEPS, src.pos, 1, true);
    const l = spots.length;
    const r = this.pos.getRangeTo(src);
    if(l < min || l === min && r < range) {
      min = spots.length;
      minSrc = src;
      range = r;
    }
  }
  return src;
};
