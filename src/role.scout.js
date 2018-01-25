module.exports = class CreepScout {
  roleScout () {
    const what = this.taskTask() || this.taskBoostOne() || this.goSign()
    if (what) return what

    if (this.atTeam) {
      const creep = this.pos.findClosestByRange(this.room.hostiles)
      if (creep) {
        if (this.pos.inRangeTo(creep, 4)) {
          this.dlog('Scout flee')
          return this.idleFlee(this.room.hostiles, 6)
        } else if (!this.pos.inRangeTo(creep, 10)) {
          return this.moveRange(creep, 10)
        }
      }
    }
    this.dlog('Scout move')
    return this.moveRoom(this.team) ||
      this.moveRange(this.team)
  }

  goSign () {
    if (!this.room.controller) return false
    const want = signs[this.room.name] || ''
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
  W22N19: 'The Pit',
  W24N17: 'Fortress of Solitude',
  W24N18: 'Remote Harvestation',
  W26N18: 'Remote Harvestation',
  W27N19: 'The Lowest Bar in the World',
  W33N19: 'Western Frontier'
}
