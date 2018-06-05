module.exports = class CreepMHauler {
  roleMineral () {
    const cont = Game.getObjectById(this.memory.cont)
    if (!cont) return this.idleRecycle()

    if (this.movePos(cont)) return 'moving'

    if (cont.storeFree < this.info.mineral) return false

    const mineral = _.first(this.room.find(FIND_MINERALS))
    const ret = this.harvest(mineral)
    if (ret === OK || ret === ERR_NOT_FOUND) return 'mined'

    return this.idleRecycle()
  }
}
