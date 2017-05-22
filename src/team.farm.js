const util = require('util');

Flag.prototype.teamFarm = function() {
  let nfarmer = 1;
  let canReserve = false;
  let nminer = 1;
  if (this.room) {
    const nsrcs = this.room.find(FIND_SOURCES).length;
    nminer = nsrcs;
    const controller = this.room.controller;
    const claimed = controller && controller.owner && !controller.my;
    canReserve = !this.room.memory.thostiles && controller && !claimed &&
        controller.resTicks < 4000 &&
        (this.memory.spawnDist.min < 2 || nsrcs > 1);
  }

  this.dlog(`farmers: ${nfarmer}, reservers: ${canReserve}`);

  return this.teamSuppress() || 
      this.teamHarvest() ||
      canReserve && this.upkeepRole(1, {role:'reserver',body:'reserve'}, 2, this.closeSpawn(1300));
};

Creep.prototype.taskRoadUpkeep = function() {
  return this.taskRepairRoads() || this.taskBuildStructs(STRUCTURE_ROAD) ||
      this.taskBuildAny();
};

Flag.prototype.teamHarvest = function() {
  let nminer = 1;
  let ncart = 2;
  if(this.room) {
    const nsrcs = this.room.find(FIND_SOURCES).length;
    ncart = nsrcs + 1;
    nminer = nsrcs;
    const miners = this.roleCreeps('miner');
    if(miners.length >= nminer) {
      const totalE = _.sum(this.room.find(FIND_SOURCES), 'energyCapacity');
      const perE = totalE / ENERGY_REGEN_TIME;
      const needWork = perE / HARVEST_POWER;
      const works = _.sum(miners, m => m.partsByType[WORK]);
      if(needWork > works) {
        nminer = miners.length + 1;
      }
    }
  }
  return this.upkeepRole(nminer, {role:'miner', body:'miner'}, 2, this.closeSpawn(550)) ||
    this.upkeepRole(ncart, {role:'cart', body:'cart'}, 3, this.closeSpawn(550)) ||
    this.upkeepRole(1, {role:'farmer',body:'farmer'}, 2, this.closeSpawn(800));
};

Flag.prototype.teamSuppress = function() {
  if(!this.room) {
    return this.upkeepRole(1, {role:'scout',body:'scout'}, 4, this.closeSpawn(300));
  }
  const t = this.room.memory.thostiles;
  const nguard = Math.ceil(t/300);
  const nwolf = Math.floor(t/300);
  this.dlog(`attacked ${t}: guard ${nguard}, wolf ${nwolf}`);
  return this.upkeepRole(nwolf, {role:'wolf', body:'attack'}, 3, this.closeSpawn(570)) ||
    this.upkeepRole(nguard, {role:'guard', body:'guard'}, 3, this.closeSpawn(190));
};
