import {randomResource} from 'creep.carry';

module.exports = class CreepMinecart {
  roleMinecart () {
    const what = this.taskTask()
    if (what) return what

    let cont = Game.getObjectById(this.memory.cont)
    if (!cont) {
      this.log('Missing cont')
      return false
      // return this.idleRecycle()
    }

    if (!this.store.getUsedCapacity()) {
      if (this.ticksToLive < 25) this.suicide()
      const m = this.moveNear(cont)
      if (m) return m
    }

    if (this.store.getUsedCapacity()) {
      const r = randomResource(this.store)
      return this.taskTransfer(this.teamRoom.terminal, r)
    }

    if (cont.store.getUsedCapacity() >= this.store.getFreeCapacity() || this.ticksToLive < 50) {
      return this.taskWithdrawResource(cont)
    }

    return 'waiting'
  }
}
