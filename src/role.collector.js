const lib = require('lib');

class CreepCollector {
  roleCollector() {
    let what = this.idleRetreat(CARRY) || this.taskTask();
    if(what) return what;

    if(this.atTeam && this.carryFree) {
      return this.taskCollect();
    }

    if(this.carryTotal) {
      if(this.pos.roomName === this.dropRoom().name) {
        return this.taskTransferResources();
      }
      return this.taskMoveRoom(this.dropRoom().controller);
    }

    return this.taskMoveFlag(this.team);
  }

  afterCollector() {
    this.idleNom();
  }

  taskCollect() {
    this.dlog('collect')
    if (!this.carryFree) return false;

    return this.taskPickupAny() || this.taskWithdrawAny();

    const batteries = _.filter(this.room.find(FIND_STRUCTURES), s => s.energy);

    const target = _.sample(resources.concat(stores).concat(batteries));
    if (target) {
      if (target.structureType) {
        return this.taskWithdraw(target, RESOURCE_ENERGY);
      }
      return this.taskPickup(target);
    }
    return false;
  }
}

lib.merge(Creep, CreepCollector);
