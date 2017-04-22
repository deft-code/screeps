Flag.prototype.roleFarmer = function(spawn) {
  let body = [
    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,

    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK,  MOVE, CARRY, MOVE, CARRY, MOVE, WORK, MOVE, CARRY, MOVE, CARRY,

    MOVE, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'farmer'});
};

Creep.prototype.roleFarmer = function() {
  this.idleNom();
  return this.actionHospital() || this.taskTask() ||
      !this.carryTotal && this.taskTravelFlag(this.team) ||
      this.taskRoadUpkeep(this.team.room) ||
      this.taskDismantleHostile(this.team.room) ||
      this.taskFarm(this.team.room) ||
      this.carryTotal && this.taskTravel(this.home.controller) ||
      this.taskXferNearest(this.home);
};

Creep.prototype.taskFarm = function(room) {
  if (!room) return false;

  if (!this.carryFree) return false;

  let resources = _.filter(
      room.find(FIND_DROPPED_RESOURCES),
      r => r.resourceType != RESOURCE_ENERGY || r.amount > 20);

  let stores = _.filter(room.find(FIND_STRUCTURES), s => s.storeTotal);

  const target = _.sample(resources.concat(stores));
  if (target) {
    if (target.structureType) {
      return this.taskWithdraw(target, RESOURCE_ENERGY);
    } else {
      return this.taskPickup(target);
    }
  }

  return this.taskHarvestAny(room);
};
