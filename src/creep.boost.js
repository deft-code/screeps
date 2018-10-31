module.exports = class CreepBoost {
  doBoosts () {
    if (this.spawning || this.ticksToLive < 100) {
      if (this.memory.boosts) {
        this.room.requestBoosts(this.memory.boosts)
      }
    }
  }
  taskBoostOne () {
    if (!_.size(this.memory.boosts)) return false
    const mineral = this.memory.boosts.pop()
    const what = this.taskBoostMineral(mineral)
    if (!what) {
      this.log(`ERROR: unable to boost ${mineral}`)
    }
    return what
  }

  taskBoostMineral (mineral) {
    return this.taskBoost(this.room.requestBoost(mineral))
  }

  taskBoost (lab) {
    this.doBoosts()
    lab = this.checkId('boost', lab)
    if (!lab) return false
    lab.room.requestBoost(lab.planType)

    if (lab.mineralAmount < LAB_BOOST_MINERAL) return false
    if (lab.energy < LAB_BOOST_ENERGY) return false

    const err = lab.boostCreep(this)
    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(lab)
    }
    if (err !== OK) {
      this.log(`UNEXPECTED boost error: ${err}, ${lab}`)
      return false
    }
    return 'success'
  }
}
