const util = require('util');

Flag.prototype.teamFarm = function() {
  const delta = this.memory.attacked - Game.time;
  this.attacked = delta > 0 ? delta : 0;
  this.dlog('attack delta:', this.memory.attacked, delta, this.attacked);
  if (!this.attacked) {
    if (this.room && this.room.hostiles.length) {
      this.memory.attacked = Game.time + this.room.hostiles[0].ticksToLive;
    } else {
      delete this.memory.attacked;
    }
  }

  const nguard = this.attacked ? 1 : 0;
  let nfarmer = 1;
  let canReserve = false;
  if (this.room) {
    const nsrcs = this.room.find(FIND_SOURCES).length;
    nfarmer = nsrcs;
    const controller = this.room.controller;
    const claimed = controller && controller.owner && !controller.my;
    canReserve = !this.attacked && controller && !claimed &&
        controller.resTicks < 4000 &&
        (this.memory.spawnDist.min < 2 || nsrcs > 1);
    if (canReserve) {
      nfarmer++;
    }
  }

  this.dlog(`farmers: ${nfarmer}, reservers: ${canReserve}, guards: ${nguard}`);

  return this.upkeepRole(nguard, {role:'guard',body:'guard'}, 2, this.closeSpawn(800)) ||
      this.upkeepRole(nfarmer, {role:'farmer',body:'farmer'}, 2, this.closeSpawn(800)) ||
      canReserve && this.upkeepRole(1, {role:'reserver',body:'reserve'}, 2, this.closeSpawn(1300)) ||
      'enough';
};

Creep.prototype.taskRoadUpkeep = function() {
  return this.taskRepairRoads() || this.taskBuildStructs(STRUCTURE_ROAD) ||
      this.taskBuildAny();
};
