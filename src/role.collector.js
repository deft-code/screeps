Flag.prototype.roleCollector = function(spawn) {
  const body = [
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'collector'});
};

Creep.prototype.roleCollector = function() {
  this.idleNom();
  return this.idleRetreat(CARRY) || this.actionTask() ||
      !this.carryTotal && this.taskTravelFlag(this.team) ||
      this.actionCollect(this.team.room) ||
      this.carryTotal && this.taskTravel(this.home.controller) ||
      this.actionXferNearest(this.home);
};

Creep.prototype.actionCollect = function(room) {
  if (!room) return false;

  if (!this.carryFree) return false;

  let resources = _.filter(
      room.find(FIND_DROPPED_RESOURCES),
      r => r.resourceType != RESOURCE_ENERGY || r.amount > 20);

  let stores = _.filter(room.find(FIND_STRUCTURES), s => s.storeTotal);

  const target = _.sample(resources.concat(stores));
  if (target) {
    if (target.structureType) {
      return this.actionUnstore(target);
    } else {
      return this.actionPickup(target);
    }
  }
  return false;
};
