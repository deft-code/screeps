module.exports = class CreepHauler {
  roleHauler () {
    let what = this.taskTask()
    if (what) return what

    if (!this.atTeam) return this.taskMoveFlag(this.team)

    if (this.room.myStorage &&
      this.ticksToLive < 2 * this.pos.getRangeTo(this.room.storage)) {
      return this.taskTransferStorage()
    }

    what = this.taskTransferTowers(100)
    if (what) return what

    if (this.room.energyFreeAvailable) {
      this.dlog('refill pools')
      if (!this.carry.energy) return this.taskRecharge()
      return this.taskTransferPool()
    }

    if (this.carryFree) {
      what = this.taskPickupAny()
      if (what) return what

      // Only clear drains when we have significant space.
      // This prevents hauler thrashing.
      if (this.carryFree > this.carryTotal) {
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
        this.dlog(`skipping drain; too full: ${this.carry.energy}`)
      }
    }

    const nonE = this.carryTotal - this.carry.energy
    if (nonE) return this.taskTransferMinerals()

    if (!this.carry.energy) {
      if (this.room.storage && this.room.storage.store.energy > 100000) {
        return this.taskWithdraw(this.room.storage, RESOURCE_ENERGY)
      }
      return false
    }

    what = this.taskTransferTowers(800)
    if (what) return what

    const structs = _.shuffle(this.room.findStructs(
        STRUCTURE_CONTAINER, STRUCTURE_LAB, STRUCTURE_TERMINAL,
        STRUCTURE_TOWER, STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN))

    for (let struct of structs) {
      switch (struct.structureType) {
        case STRUCTURE_CONTAINER:
          if (struct.mode === 'sink' && struct.storeFree > 500) {
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
          if (struct.energyFree) return this.taskTransfer(struct, RESOURCE_ENERGY)
          break
      }
    }
    return this.taskTransferStorage()
  }

  taskTransferStorage () {
    if (!this.room.myStorage) return false
    const res = _.sample(_.keys(this.carry))
    if (!this.carry[res]) return false
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
