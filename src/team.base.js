Flag.prototype.teamBase = function() {
  if (!this.room || !this.room.controller.my) {
    if (!this.room.claimable) return 'not claimable';

    return this.upkeepRole('claimer', 1, 5, this.closeSpawn(650));
  }

  if (!this.room.find(FIND_MY_CREEPS).length &&
      this.room.findStructs(STRUCTURE_SPAWN).length) {
    return this.upkeepRole('bootstrap', 1, 5, this.localSpawn(300));
  }

  if (!this.room.storage) {
    return this.upkeepRole('bootstrap', 4, 3, this.remoteSpawn());
  }

  const srcers = this.roleCreeps('srcer');
  if (!srcers.length) {
    const where = this.upkeepRole('srcer', 1, 4, this.localSpawn(300));
    if (where) return where;
  }

  const haulers = this.roleCreeps('hauler');
  if (!haulers.length) {
    const where = this.upkeepRole('hauler', 1, 4, this.localSpawn(300));
    if (where) return where;
  }

  let nworker = 1;
  if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
    nworker += 1;
  }

  const eCap = this.room.energyCapacityAvailable;

  return this.upkeepRole('srcer', 2, 3, this.localSpawn(Math.min(eCap, 750))) ||
      this.upkeepRole('hauler', 2, 3, this.localSpawn(eCap / 3)) ||
      this.upkeepRole('worker', nworker, 3, this.localSpawn(eCap)) ||
      this.upkeepRole('upgrader', 1, 3, this.localSpawn(eCap)) || 'enough';
};
