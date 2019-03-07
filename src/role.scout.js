module.exports = class CreepScout {
  roleScout () {
    const what = this.taskTask() || this.goSign()
    if (what) return what

    if (this.atTeam) {
      const creep = this.pos.findClosestByRange(this.room.hostiles)
      if (creep) {
        if (this.pos.inRangeTo(creep, 4)) {
          this.dlog('Scout flee')
          return this.idleFlee(this.room.hostiles, 6)
        } else if (!this.pos.inRangeTo(creep, 10)) {
          return this.moveRange(creep, {range: 10})
        }
      }
    }
    this.dlog('Scout move')
    return this.moveRoom(this.team) ||
      this.taskStompAll() ||
      this.moveRange(this.team)
  }

  goSign () {
    if (!this.room.controller) return false
    const want = signs[this.room.name]
    if (!want) return false
    let sign = false
    if (want.length) {
      sign = !this.room.controller.sign ||
        this.room.controller.sign.text !== want
    } else {
      sign = !!this.room.controller.sign
    }
    if (sign) {
      const err = this.signController(this.room.controller, want)
      if (err === ERR_NOT_IN_RANGE) {
        return this.moveNear(this.room.controller)
      }
      if (err !== OK) {
        this.log('Failed to sign controller:', want)
      }
      return 'signing'
    }
    return false
  }
}

const signs = {
  W18N18: 'Zombie Farm',
  W19N18: 'Zombie Farm',
  W21N18: 'RIP Ricochet1k',
  W22N12: 'Strongmint Was Here',
  W22N19: 'The Pit',
  W23N17: "You weren't using it",
  W23N18: 'Here lies Loena',
  W24N17: 'Fortress of Solitude',
  W24N18: 'Remote Harvestation',
  W26N18: 'Remote Harvestation',
  W27N19: 'The Lowest Bar in the World',
  W28N18: 'The Last Lupus',
  W29N21: 'RIP Nossarian',
  W33N19: 'Western Frontier',
  W34N19: 'RIP Charles Dankwin',
  W35N18: 'RIP explosion33'
}
