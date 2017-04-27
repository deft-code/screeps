const lib = require('lib');

Flag.prototype.roleCollector = function(spawn) {
  const body = [
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY,
    MOVE, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'collector'});
};

class CreepCollector {
  roleCollector() {
    let what = this.idleRetreat(CARRY) || this.taskTask();
    if(what) return what;

    if(this.atTeam && this.carryFree) {
      return this.taskCollect();
    }

    if(this.carryTotal) {
      if(this.atHome) {
        return this.taskTransferResources();
      }
      return this.taskMoveRoom(this.home.controller);
    }

    return this.taskMoveFlag(this.team);
  }

  afterCollector() {
    this.idleNom();
  }

  taskCollect() {
    this.dlog('collect')
    if (!this.carryFree) return false;

    let resources = _.filter(
        this.room.find(FIND_DROPPED_RESOURCES),
        r => r.resourceType != RESOURCE_ENERGY || r.amount > 20);

    let stores = _.filter(this.room.find(FIND_STRUCTURES), s => s.store && s.store.energy);

    const batteries = []; //_.filter(this.room.find(FIND_STRUCTURES), s => s.energy);

    const target = _.sample(resources.concat(stores).concat(batteries));
    if (target) {
      if (target.storeTotal) {
        this.dlog("collect store", target);
        return this.taskWithdrawStore(target, RESOURCE_ENERGY);
      } else if(target.energyCapacity) {
        return this.taskWithdraw(target, RESOURCE_ENERGY);
      } else {
        return this.taskPickup(target);
      }
    }
    return false;
  }
}

lib.merge(Creep, CreepCollector);
