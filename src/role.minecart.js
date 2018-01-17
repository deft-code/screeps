const lib = require('lib')
const debug = require('debug')
const util = require('util')

module.exports = class CreepMinecart {
  roleMinecart () {
    const what = this.taskTask()
    if (what) return what

    let cont = lib.lookup(this.memory.cont)
    if (!cont) {
      debug.log('Missing cont')
      return false
      // return this.idleRecycle()
    }

    if (!this.carryTotal) {
      if (this.ticksToLive < 25) this.suicide()
      const m = this.moveNear(cont)
      if (m) return m
    }

    if (this.carryTotal) {
      const r = util.randomResource(this.carry)
      return this.taskTransfer(this.teamRoom.terminal, r)
    }

    if (cont.storeTotal >= this.carryFree || this.ticksToLive < 50) {
      return this.taskWithdrawResource(cont)
    }

    return 'waiting'
  }
}
