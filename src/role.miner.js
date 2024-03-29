module.exports = class CreepMiner {
  roleMiner () {
    return this.idleRetreat(WORK) || this.fleeHostiles() ||
    this.taskTask() || this.taskMoveFlag(this.team) || this.taskHarvestSpots()
  }

  afterMiner () {
    if (this.fatigue && this.store.energy) {
      this.drop(RESOURCE_ENERGY)
    }

    if (this.store.getFreeCapacity() < this.info.harvest) {
      const destCreep = _.find(
        this.room.find(FIND_MY_CREEPS),
        creep => creep.memory.role !== this.memory.role &&
            creep.store.getFreeCapacity() &&
            this.pos.isNearTo(creep))
      this.dlog(`share energy with ${destCreep}`)
      if (destCreep) return this.goTransfer(destCreep, RESOURCE_ENERGY, false)
      this.dlog(`drop energy ${JSON.stringify(this.store)}`)
      this.drop(RESOURCE_ENERGY)
    }
  }
}
