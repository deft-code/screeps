const lib = require('lib');

class CreepFarmer {
  roleFarmer() {
    const what = this.idleRetreat(CARRY) || this.taskTask();
    if(what) return what;

    if(this.pos.roomName === this.dropRoom().name) {
      if(this.carryTotal) {
        return this.taskTransferResources() || this.taskBuildOrdered() || this.taskRepairOrdered() ||
          this.goUpgradeController(this.room.controller);
      }
      return this.taskMoveFlag(this.team);
    }

    return this.taskRoadUpkeep() || this.taskFarm() || this.taskMoveRoom(this.dropRoom().controller);
  }

  afterFarmer()  {
    this.idleNom();
    this.idleBuild() || this.idleRepair();
    this.idleUpgrade();
  }

  dropRoom() {
    let room = Game.rooms[this.memory.dropRoom];
    if(!room) {
      let minD = Infinity;
      let minE = Infinity;

      for(const rName in Game.rooms) {
        const r = Game.rooms[rName];
        if(!r.controller || !r.controller.my) continue;
        const d = Game.map.findRoute(this.room, r).length;
        if(d > minD) continue;
        if(d === minD) {
          const e = r.storage && r.storage.store.energy || 0;
          if(e >= minE) continue;
        }
        room = r;
      }
    }
    this.memory.dropRoom = room.name;
    return room;
  }

  taskFarm() {
    if (!this.carryFree) return false;

    return this.taskCollect() || this.taskHarvestSpots();
  }
}

lib.merge(Creep, CreepFarmer);
