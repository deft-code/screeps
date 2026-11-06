import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';
import { randomResource } from 'creep.carry';

// Flag-team mineral cart from a container to the terminal;
// job.hubminecart.ts replaced it.
@injecter(Creep)
export class CreepMinecart extends CreepHeal {
  roleMinecart () {
    const what = this.taskTask()
    if (what) return what

    let cont = lib.byId<StructureContainer>(this.memory.cont)
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
