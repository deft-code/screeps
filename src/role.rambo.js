module.exports = class Rambo {
  roleRambo () {
    this.goHeal(this, false)

    const what = this.idleRetreat(TOUGH) || this.taskTask() || this.taskBoostOne() || this.moveRoom(this.team)
    if (what) return what

    if (this.room.name === this.team.pos.roomName) {
      const s = this.room.find(FIND_HOSTILE_STRUCTURES)
      const targets = _.filter(s, s => s.structureType === STRUCTURE_TOWER)
      const tower = this.pos.findClosestByRange(targets)
      return this.taskRangedAttack(tower)
    }

    return this.moveRange(this.team)
  }
}
