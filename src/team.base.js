Flag.prototype.teamBase = function() {
  if (!this.room || !this.room.controller.my) {
    this.dlog("claim base");
    if (!this.room || !this.room.claimable) {
      this.dlog("Scout the room");
      return this.upkeepRole(1, {role:'scout',body:'scout'}, 4, this.closeSpawn(300));
    }

    return this.ensureRole(1, {role:'claimer',body:'claim'}, 4, this.closeSpawn(650));
  }

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

  // TODO Delete after path to corner.
  if(this.name !== 'Corner') {

  // Mark this room as a base
  this.room.base = this.name;

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

  let ulvl = 50;
  if(this.room.storage && this.room.storage.energy < 10000) {
    ulvl = 1
  }

  const ehauler = Math.min(2500, eCap/3);
  const eworker = Math.min(3300, eCap);

  const t = this.room.memory.tenemies;
  this.dlog(`attacked ${t}`);
  let ndefenders = 0;
  if(t > 40) {
    const t2 = t-40
    ndefenders = Math.ceil(t2/300);
    this.dlog("need defenders");
  }

  return this.ensureRole(2, {role:'srcer',body:'srcer'}, 4, this.localSpawn(Math.min(eCap, 750))) ||
      this.upkeepRole(ndefenders, {role:'wolf', body:'defender'}, 5, this.localSpawn(eCap)) ||
      this.ensureRole(nhauler, {role:'hauler',body:'carry'}, 4, this.localSpawn(ehauler)) ||
      this.ensureRole(nworker, {role:'worker',body:'worker'}, 3, this.localSpawn(eCap)) ||
      this.ensureRole(1, {role:'upgrader',body:'upgrader',max:ulvl}, 3, this.localSpawn(eCap)) || 'enough';
};
