module.exports = class CreepMiner {
  roleMiner() {
    return this.idleRetreat(WORK) || this.fleeHostiles() ||
    this.taskTask() || this.taskMoveFlag(this.team) || this.taskHarvestSpots();
  }

  afterMiner() {
    if(!this.carryFree) this.drop(RESOURCE_ENERGY);
  }
};
