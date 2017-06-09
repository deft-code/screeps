const util = require('util');

Flag.prototype.teamFarm = function() {
  let canReserve = false;
  if (this.room) {
    const nsrcs = this.room.find(FIND_SOURCES).length;
    const controller = this.room.controller;
    const claimed = controller && controller.owner && !controller.my;
    this.dlog(this.room, "claimed", claimed);
    let wantReserve = this.memory.reserve;
    if(wantReserve === undefined) {
        wantReserve = this.minSpawnDist() < 3 || nsrcs > 1;
    }
    canReserve = !this.room.memory.thostiles && controller && !claimed &&
        controller.resTicks < 4000 && wantReserve;
  }

  this.dlog(`${this.room} reservable: ${canReserve}`);

  return this.teamSuppress() || 
      this.teamHarvest() ||
      canReserve && this.upkeepRole(3, {role:'reserver',body:'reserve'}, 2, this.closeSpawn(1300));
};

Creep.prototype.taskRoadUpkeep = function() {
  if(!this.carry.energy) return false;

  this.dlog("roadUpkeep");

  return this.taskRepairRoads() || this.taskBuildStructs(STRUCTURE_ROAD) ||
      this.taskBuildAny();
};

Flag.prototype.teamHarvest = function() {
  let nminer = 1;
  let ncart = 1;
  let cartMax = 50;
  let nfarmer = 0;
  if(this.room) {
    if(this.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
      nfarmer = 1;
    }

    const srcs = this.room.find(FIND_SOURCES);
    nminer = srcs.length;
    ncart = nminer;

    // TODO reenable once cpu use is fixed
    //const dist = this.minSpawnDist();
    //const totalE = _.sum(this.room.find(FIND_SOURCES), 'energyCapacity');
    //const perE = totalE / ENERGY_REGEN_TIME;
    //const estimate = dist * 100 * perE / 50;
    //const carts = this.roleCreeps('cart');
    //const carries = _.sum(carts, c => c.partsByType[CARRY]);
    //if(carries < estimate) {
    //  const nspots = _.sum(srcs, s => s.spots.length);
    //  ncart = Math.min(carts.length + 1, nspots);
    //  cartMax = Math.ceil((estimate + (estimate - carries)) / 2);
    //}
  }
  return this.upkeepRole(nminer, {role:'miner', body:'miner'}, 2, this.closeSpawn(550)) ||
    this.upkeepRole(ncart, {role:'cart', body:'cart', max:cartMax}, 3, this.closeSpawn(550)) ||
    this.upkeepRole(nfarmer, {role:'farmer',body:'farmer'}, 2, this.closeSpawn(800));
};

Flag.prototype.teamSuppress = function(e=0) {
  if(!this.room) {
    return this.upkeepRole(1, {role:'scout',body:'scout'}, 4, this.closeSpawn(300));
  }
  const t = this.room.memory.thostiles;
  const nguard = Math.ceil(t/300);
  const nwolf = Math.floor(t/300);
  this.dlog(`attacked ${t}: guard ${nguard}, wolf ${nwolf}`);
  return this.upkeepRole(nwolf, {role:'wolf', body:'attack'}, 3, this.closeSpawn(e+570)) ||
    this.upkeepRole(nguard, {role:'guard', body:'guard'}, 3, this.closeSpawn(e+190));
};
