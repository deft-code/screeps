const lib = require('lib');

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

      for(const r of Game.rooms) {
        if(!r.controller.my) continue;
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

    return this.taskCollect() || this.taskHarvestAny();
  }
}

lib.merge(Creep, CreepFarmer);
