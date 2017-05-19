Flag.prototype.teamOccupy = function() {
  if (!this.room || !this.room.controller.my) {
    this.dlog("claim farm");
    if (!this.room || !this.room.claimable) {
      this.dlog("Scout the farm");
      return this.upkeepRole(1, {role:'scout',body:'scout'}, 4, this.closeSpawn(300));
    }
    return this.upkeepRole(1, {role:'claimer',body:'claim'}, 4, this.closeSpawn(650));
  }

  const nsrcs = this.room.find(FIND_SOURCES).length + 1;
  return this.teamSuppress() || 
    this.upkeepRole(nsrcs, {role:'farmer',body:'farmer'}, 2, this.closeSpawn(800));
};

Flag.prototype.teamSuppress = function() {
  const t = this.room.memory.thostiles;
  this.dlog(`attacked ${t}`);
  let nguard = 0;
  if(t) {
    this.dlog("need guard");
    nguard = 1;
  }
  let nwolf = 0;
  if(t > 300) {
    this.dlog("need wolf");
    nwolf = 1;
  }
  return this.upkeepRole(nwolf, {role:'wolf', body:'attack'}, 3, this.closeSpawn()) ||
    this.upkeepRole(nguard, {role:'guard', body:'guard'}, 3, this.closeSpawn());
};
