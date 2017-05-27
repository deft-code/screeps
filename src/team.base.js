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

  let nworker = 1;
  if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
    nworker++;
  }

  const eCap = this.room.energyCapacityAvailable;

  const dropped = _.sum(
    this.room.find(FIND_DROPPED_RESOURCES),
    r => r.amount);
  const nhauler = Math.ceil(dropped / 1000) + 1;

  let ulvl = 50;
  let nupgrader = 1;
  if(this.room.controller.level === 8) {
    ulvl = 15
  }
  if(this.room.storage ) {
    if(this.room.storage.store.energy < 10000) {
      ulvl = 1
    } else if(this.room.storage.store.energy > 200000) {
      nupgrader += 1;
    }
  }

  const ehauler = Math.min(2500, eCap/3);
  const eworker = Math.min(3300, eCap);

  const te = this.room.memory.tenemies;
  this.dlog(`attacked ${te}`);
  let ndefenders = 0;
  if(te > 40) {
    const t2 = te-40
    ndefenders = Math.ceil(t2/300);
    this.dlog("need defenders");
  }

  const ta = this.room.memory.tassautlers;
  let nmicro = 0;
  if(ta === 0 && te > 0) {
    nmicro = 1;
  }

  let nchemist =  0;
  if(this.room.terminal) {
    nchemist = 1;
  }

  return this.ensureRole(2, {role:'srcer',body:'srcer'}, 4, this.localSpawn(Math.min(eCap, 750))) ||
      this.upkeepRole(nmicro, {role:'wolf', body:'defender', max:1}, 5, this.localSpawn(260)) ||
      this.upkeepRole(ndefenders, {role:'wolf', body:'defender'}, 5, this.localSpawn(eCap)) ||
      this.ensureRole(nhauler, {role:'hauler',body:'carry'}, 4, this.localSpawn(ehauler)) ||
      this.ensureRole(nworker, {role:'worker',body:'worker'}, 3, this.localSpawn(eCap)) ||
      this.ensureRole(nupgrader, {role:'upgrader',body:'upgrader',max:ulvl}, 3, this.localSpawn(eCap)) ||
      this.ensureRole(nchemist, {role:'chemist',body:'chemist'}, 3, this.localSpawn(eCap));
};
