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

    return this.moveRoom(this.team);
  }

  afterCollector() {
    this.idleNomNom();
  }

  taskCollect() {
    this.dlog('collect')
    if (!this.carryFree) return false;

    return this.taskPickupAny() || this.taskWithdrawAny();
    //return this.taskWithdrawAny() || this.taskPickupAny();
  }
}

lib.merge(Creep, CreepCollector);
