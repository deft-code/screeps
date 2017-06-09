module.exports = class CreepMineral {
  roleMineral() {
    let mineral = Game.getObjectById(this.memory.mineral);
    if(!mineral) {
      mineral = _.first(this.room.find(FIND_MINERALS));
    }
    this.memory.mineral = mineral.id;

    if(!this.carryTotal && !mineral.mineralAmount) {
      return this.idleRecycle();
    }

    return this.taskTask() || 
      this.taskMoveRoom(this.team) ||
      this.taskHarvestMineral(mineral) ||
      this.taskTransferMinerals() ||
      this.moveNear(this.room.terminal);
  }
};
