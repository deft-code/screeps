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
      this.upkeepRole(nsrcs, {role:'miner', body:'miner'}, 2, this.closeSpawn(550)) ||
      this.upkeepRole(nsrcs, {role:'cart', body:'cart'}, 3, this.closeSpawn(550)) ||
      this.upkeepRole(1, {role:'farmer',body:'farmer'}, 2, this.closeSpawn(800));
};
