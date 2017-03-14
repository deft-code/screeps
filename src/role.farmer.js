Flag.prototype.roleFarmer = function(spawn) {
  let body = [
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
    //MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'farmer'});
};

Creep.prototype.roleFarmer = function() {
  this.idleNom();
  return this.actionHospital() ||
      this.actionTask() ||
      !this.carryTotal && this.actionTravelFlag(this.team) ||
      this.actionRoadUpkeep(this.team.room) ||
      this.actionDismantleHostile(this.team.room) ||
      this.actionFarm(this.team.room) ||
      this.carryTotal && this.actionTravel(this.home.controller) ||
      this.actionXferNearest(this.home);
};

Creep.prototype.actionFarm = function(room) {
  if(!room) return false;

  if(!this.carryFree) return false;
    
  let resources = _.filter(
    room.find(FIND_DROPPED_RESOURCES),
    r => r.resourceType != RESOURCE_ENERGY || r.amount > 20);
  
  let stores = _.filter(
      room.find(FIND_STRUCTURES),
      s => s.storeTotal);

  const target = _.sample(resources.concat(stores));
  if(target) {
    if(target.structureType) {
      return this.actionUnstore(target);
    } else {
      return this.actionPickup(target);
    }
  }
  
  return this.taskHarvestAny(room);
};

