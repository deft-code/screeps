module.exports = class CreepMiner {
  roleMiner() {
    return this.idleRetreat(WORK) || this.fleeHostiles() ||
    this.taskTask() || this.taskMoveFlag(this.team) || this.taskHarvestSpots();
  }

  afterMiner() {
    if(this.carryFree < this.info.harvest) {
      //console.log(`${this} miner drop, ${JSON.stringify(this.info)}, ${JSON.stringify(this.carry)}`);
      for(const creep of this.room.find(FIND_MY_CREEPS)) {
        if(creep.memory.role !== this.memory.role && creep.carryFree && this.pos.isNearTo(creep)) {
          // console.log(this, "miner share", creep);
          this.dlog(`Shared ${this.carry.energy} with ${creep}`);
          return this.goTransfer(creep, RESOURCE_ENERGY, false);
        }
      }
      this.drop(RESOURCE_ENERGY);
    }
  }
};
