const lib = require('lib')
const debug = require('debug')

module.exports = class CreepMineral {
  roleMineral () {
    let cont = lib.lookup(this.memory.cont)
    if (!cont) {
      debug.log('Missing cont')
      return false
      // return this.idleRecycle()
    }

    if (this.movePos(cont)) return 'moving'

    if (cont.storeFree < this.info.mineral) return false

    const mineral = _.first(this.room.find(FIND_MINERALS))
    const ret = this.harvest(mineral)
    if (ret === ERR_TIRED) return 'waiting'
    if (ret === OK) return 'mined'
    if (ret === ERR_NOT_ENOUGH_RESOURCES) return 'empty'

    this.log(ret)
    return false
    // return this.idleRecycle()
  }
}
