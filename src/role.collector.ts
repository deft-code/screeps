import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';
import { LegacyRet } from 'Tasker';

// Flag-team loot collector; no job spawns it. taskCollect is the farmer's too.

declare global {
  interface Creep {
    taskCollect(): LegacyRet
  }
}

@injecter(Creep)
export class CreepCollector extends CreepHeal {
  roleCollector () {
    let what = this.idleRetreat(CARRY) || this.taskTask()
    if (what) return what

    if (this.atTeam && this.store.getFreeCapacity()) {
      return this.taskCollect()
    }

    if (this.store.getUsedCapacity()) {
      if (this.pos.roomName === this.dropRoom().name) {
        return this.taskTransferResources()
      }
      return this.taskMoveRoom(this.dropRoom().controller || null)
    }

    return this.moveRoom(this.team)
  }

  afterCollector () {
    this.idleNomNom()
  }

  taskCollect () {
    this.dlog('collect')
    if (!this.store.getFreeCapacity()) return false

    return this.taskPickupAny() || this.taskWithdrawAny()
    // return this.taskWithdrawAny() || this.taskPickupAny();
  }
}
