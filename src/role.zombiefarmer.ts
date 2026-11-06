import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';
import { isStoreStruct } from 'guards';

// Flag-team looter of a dead player's stores; no job spawns it.
@injecter(Creep)
export class CreepZombieFarmer extends CreepHeal {
  roleZombiefarmer () {
    let what = this.idleRetreat(CARRY) || this.taskTask()
    if (what) return what

    if (this.store.getFreeCapacity()) {
      what = this.taskPickupAny()
      if (what) return what
    }

    if (this.atTeam && ((this.store.getFreeCapacity() && this.ticksToLive > 200) || !this.store.getUsedCapacity())) {
      return this.taskPickupAny() || this.taskZFarm()
      // return this.taskZFarm()
    }

    if (this.store.getUsedCapacity()) {
      if (this.pos.roomName === this.home.name) {
        return this.taskTransferResources()
      }
      return this.taskMoveRoom(this.home.controller || null)
    }

    return this.moveRoom(this.team)
  }

  taskZFarm () {
    if (this.room.storage && !this.room.storage.store.getFreeCapacity()) {
      return this.taskWithdrawResource(this.room.storage)
    }
    if (this.room.terminal && !this.room.terminal.store.getFreeCapacity()) {
      return this.taskWithdrawResource(this.room.terminal)
    }
    const m = _.find(
      _.shuffle(this.room.find(FIND_HOSTILE_STRUCTURES).slice()),
      s => isStoreStruct(s) && (((s.store as StoreDefinition).getUsedCapacity() - s.store.energy) > 0 || s.store.energy > 1500))
    if (m) {
      return this.taskWithdrawResource(m as XferStruct)
    }
    return false
  }

  afterZombiefarmer () {
    this.idleNomNom()
  }
}
