Flag.prototype.teamBase = function() {
  if (!this.room || !this.room.controller.my) {
    if (!this.room || !this.room.claimable) return 'not claimable';

    return this.upkeepRole(1, {role:'claimer',body:'claim'}, 4, this.closeSpawn(650));
  }

  if (!this.creeps.length && this.room.findStructs(STRUCTURE_SPAWN).length) {
    return this.upkeepRole(1, {role:'bootstrap',body:'worker'}, 5, this.localSpawn(300));
  }

  if (!this.room.storage || !this.room.storage.storeCapacity) {
    return this.upkeepRole(4, {role:'bootstrap',body:'worker'}, 3, this.remoteSpawn());
  }

  let nworker = 1;
  if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
    nworker++;
  }

  const eCap = this.room.energyCapacityAvailable;

  let nhauler = 1;
  if(this.room.find(FIND_DROPPED_RESOURCES).length) {
    nhauler++;
  }

  return this.upkeepRole(2, {role:'srcer',body:'srcer'}, 4, this.localSpawn(Math.min(eCap, 750))) ||
      this.upkeepRole(nhauler, {role:'hauler',body:'carry'}, 4, this.localSpawn(eCap / 3)) ||
      this.upkeepRole(nworker, {role:'worker',body:'worker'}, 3, this.localSpawn(eCap)) ||
      this.upkeepRole(1, {role:'upgrader',body:'upgrader'}, 3, this.localSpawn(eCap)) || 'enough';
};
