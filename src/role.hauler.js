module.exports = class CreepHauler {
  roleHauler () {
    let what = this.taskTask()
    if (what) return what

    if (!this.atTeam) return this.taskMoveFlag(this.team)

    if (this.room.storage && this.room.storage.storeCapacity &&
      this.ticksToLive < 2 * this.pos.getRangeTo(this.room.storage)) {
      return this.taskTransferStorage()
    }

    what = this.taskTransferTowers(200)
    if (what) return what

    if (this.room.energyFreeAvailable) {
      this.dlog('refill pools')
      if (!this.store.energy) return this.taskRecharge()
      return this.taskTransferPool()
    }

    if (this.store.getFreeCapacity()) {
      what = this.taskPickupAny()
      if (what) return what

      // Only clear drains when we have significant space.
      // This prevents hauler thrashing.
      if (this.store.getFreeCapacity() > this.store.getUsedCapacity()) {
        const drains = _.filter(
            this.room.findStructs(STRUCTURE_TERMINAL, STRUCTURE_CONTAINER),
            (struct) => {
              switch (struct.structureType) {
                case STRUCTURE_TERMINAL:
                  return struct.energyDrain()
                case STRUCTURE_CONTAINER:
                  return struct.mode === 'src' && struct.store.energy
              }
              return false
            })

        const drain = this.pos.findClosestByRange(drains)
        this.dlog('hauler drain', drain)
        if (drain) return this.taskWithdraw(drain, RESOURCE_ENERGY)
      } else {
        this.dlog(`skipping drain; too full: ${this.store.energy}`)
      }
    }

    const nonE = this.store.getUsedCapacity() - this.store.energy
    if (nonE) return this.taskTransferMinerals()

    if (!this.store.energy) {
      if (this.room.storage && this.room.storage.store.energy > 100000) {
        return this.taskWithdraw(this.room.storage, RESOURCE_ENERGY)
      }
      return false
    }

    what = this.taskTransferTowers(750)
    if (what) return what

    const structs = _.shuffle(this.room.findStructs(
        STRUCTURE_CONTAINER, STRUCTURE_LAB, STRUCTURE_TERMINAL,
        STRUCTURE_TOWER, STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN))

    for (let struct of structs) {
      switch (struct.structureType) {
        case STRUCTURE_CONTAINER:
          if (struct.mode === 'sink' && struct.store.getFreeCapacity() > 500) {
            return this.taskTransfer(struct, RESOURCE_ENERGY)
          }
          break
        case STRUCTURE_TERMINAL:
          if (struct.energyFill()) {
            this.dlog(`hauler fill, ${struct}`)
            return this.taskTransfer(struct, RESOURCE_ENERGY)
          }
          break
        case STRUCTURE_TOWER:
        case STRUCTURE_LAB:
        case STRUCTURE_NUKER:
        case STRUCTURE_POWER_SPAWN:
          if (struct.store.getFreeCapacity(RESOURCE_ENERGY)) return this.taskTransfer(struct, RESOURCE_ENERGY)
          break
      }
    }
    return this.taskTransferStorage()
  }

  taskTransferStorage () {
    if (!this.room.storage) return false
    const res = _.sample(_.keys(this.store))
    if (!this.store[res]) return false
    return this.taskTransfer(this.room.storage, res)
  }

  afterHauler () {
    if (this.room.terminal && this.room.terminal.my) {
      this.idleNomNom()
    } else {
      this.idleNom()
    }

    if (this.room.energyFreeAvailable) {
      this.idleRecharge()
    } else {
      this.dlog('idle withdraw', this.idleWithdrawExtra())
    }

    this.idleTransferExtra()
  }
}
