Flag.prototype.teamBase = function() {
  if (!this.room || !this.room.controller.my) {
    this.dlog("claim base");
    if (!this.room || !this.room.claimable) {
      this.dlog("Scout the room");
      return this.upkeepRole(1, {role:'scout',body:'scout'}, 4, this.closeSpawn(300));
    }
    return this.ensureRole(1, {role:'claimer',body:'claim'}, 4, this.closeSpawn(650));
  }

  const ntowers = this.room.findStructs(STRUCTURE_TOWER).length;
  if(!ntowers) {
    const what = this.upkeepRole(1, {role:'guard',body:'guard'}, 3, this.remoteSpawn());
    if(what) return what;
  }

  // Mark this room as a base
  this.room.base = this.name;

  const nspawns = this.room.findStructs(STRUCTURE_SPAWN).length;

  if ((!this.roleCreeps('srcer').length ||
    !this.roleCreeps('hauler').length) &&
    !this.roleCreeps('bootstrap').length &&
    nspawns) {
    return this.ensureRole(1, {role:'bootstrap',body:'worker'}, 5, this.localSpawn(300));
  }

  if (!this.room.storage || !this.room.storage.storeCapacity) {
    let what = this.upkeepRole(4, {role:'bootstrap',body:'worker'}, 3, this.remoteSpawn());
    if(what) return what;
  }

  if(!nspawns) return false;

  let nworker = 0;
  if(this.room.controller.ticksToDowngrade < 5000) {
    nworker = 1;
  } else if(this.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
    nworker = 1;
  } else if(!this.room.myStorage) {
    nworker = 1;
  } else if(this.room.storage.store.energy > kEnergyReserve) {
    nworker = 1;
  }

  const eCap = this.room.energyCapacityAvailable;

  const dropped = _.sum(
    this.room.find(FIND_DROPPED_RESOURCES),
    r => r.amount);
  const nhauler = Math.floor(dropped / 1000) + 1;

  let ulvl = 50;
  let nupgrader = 1;
  if(this.room.controller.level === 8) {
    ulvl = 1;
  }

  if(this.room.storage) {
    if(this.room.storage.store.energy < kEnergyReserve) {
      ulvl = 1
    } else if(this.room.storage.store.energy > 2*kEnergyReserve) {
      nupgrader += 1;
    }
  }

  let uboost = [];
  if(this.room.controller.level > 5 && this.room.controller.level < 8) {
    uboost = [
      // Wasteful
      // RESOURCE_GHODIUM_HYDRIDE,
      RESOURCE_GHODIUM_ACID,
      RESOURCE_CATALYZED_GHODIUM_ACID,
    ];
  }

  const ehauler = Math.min(2500, eCap/3);
  const eworker = Math.min(3300, eCap);

  const te = this.room.memory.tenemies;
  const ta = this.room.memory.tassaulters;

  let ndefenders = 0;
  if(ta > 40) {
    const t2 = ta-40
    ndefenders = Math.ceil(t2/300);
  }

  let nmicro = 0;
  if(ta === 0 && te > 0) {
    nmicro = 1;
  }

  let nchemist = 0;
  let nmineral = 0;
  let mlvl = 0;
  if(this.room.terminal) {
    nchemist = 1;
    nmineral = this.room.findStructs(STRUCTURE_EXTRACTOR).length;
    const mineral = _.first(this.room.find(FIND_MINERALS));
    mlvl = Math.ceil(mineral.mineralAmount / 300);
    nmineral = Math.min(mlvl, nmineral);
  }

  return this.ensureRole(2, {role:'srcer',body:'srcer'}, 4, this.localSpawn(Math.min(eCap, 750))) ||
      this.upkeepRole(nmicro, {role:'defender', body:'defender', max:1}, 5, this.localSpawn(260)) ||
      this.upkeepRole(ndefenders, {role:'defender', body:'defender'}, 5, this.localSpawn(eCap)) ||
      this.ensureRole(nhauler, {role:'hauler',body:'carry'}, 4, this.localSpawn(ehauler)) ||
      this.ensureRole(nworker, {role:'worker',body:'worker'}, 3, this.localSpawn(eCap)) ||
      this.ensureRole(nupgrader, {role:'upgrader',body:'upgrader',max:ulvl, boosts:uboost}, 3, this.localSpawn(eCap)) ||
      this.ensureRole(nmineral, {role:'mineral',body:'mineral', max:mlvl}, 3, this.localSpawn(eCap)) ||
      this.ensureRole(nchemist, {role:'chemist',body:'carry', max:10}, 3, this.localSpawn(1000));
};
