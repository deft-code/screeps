module.exports = class CreepMedic {
  roleMedic () {
    return this.idleRetreat(TOUGH) ||
      this.idleHealNear() ||
      this.taskTask() ||
      this.taskBoostOne() ||
      this.moveRoom(this.team) ||
      this.taskHealTeam(this.team) ||
      this.taskHealRoom() ||
      this.moveRange(this.team, {allowHostile: true})
  }

  afterMedic () {
    this.idleHeal()
  }

  idleHealNear () {
    let creep = _(this.room.lookForAtRange(LOOK_CREEPS, this.pos, 1, true))
      .map(spot => spot[LOOK_CREEPS])
      .filter(creep => creep.my && creep.hurts)
      .sortBy(c => -c.hurts)
      .first()

    if (creep) {
      return this.goHeal(creep)
    }
  }

  taskHealTeam () {
    return this.taskHealCreeps(this.team.creeps)
  }

  taskHealRoom () {
    return this.taskHealCreeps(this.room.find(FIND_MY_CREEPS))
  }

  taskHealCreeps (creeps) {
    const creep = _.find(creeps, 'hurts')
    if (!creep) return false
    return this.taskHeal(creep)
  }

  taskHeal (creep) {
    creep = this.checkId('heal', creep)
    if (!creep || !creep.hurts) return false
    return this.goHeal(creep)
  }
}
