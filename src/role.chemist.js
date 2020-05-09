function nonenergy (carry) {
  const m = _(carry)
    .keys()
    .filter(k => k !== RESOURCE_ENERGY)
    .max(k => carry[k])
  if (_.isString(m)) return m
  return false
}

Room.prototype.labForMineral = function (mineral) {
  for (const lab of this.findStructs(STRUCTURE_LAB)) {
    if (lab.planType === mineral && lab.mineralFill()) {
      return lab
    }
  }
  return false
}

Room.prototype.contForMineral = function (mineral) {
  const conts = _.filter(this.findStructs(STRUCTURE_CONTAINER), s => s.store.getFreeCapacity())
  return _.find(conts, cont => cont.store[mineral]) ||
      _.find(conts, cont => cont.mode === 'sink') || _.first(conts)
}

module.exports = class CreepChemist {
  roleChemist () {
    const what = this.taskTask() ||
      this.taskMoveRoom(this.team)
    if (what) return what

    if (this.store.getUsedCapacity()) {
      return this.taskNukerFill() ||
        this.taskSortMinerals() ||
        this.taskLabEnergy()
    }

    return this.taskResortMinerals() ||
      this.taskLabFill() ||
      this.taskLabEnergy() ||
      this.taskNukerFill() ||
      this.moveRange(this.room.terminal)
  }

  afterChemist () {
    this.idleNomNom()
  }

  taskLabEnergy () {
    if (!this.room.terminal || !this.room.terminal.my) return false

    const lab = _.find(this.room.findStructs(STRUCTURE_LAB),
      s => s.store.getFreeCapacity(RESOURCE_ENERGY))
    this.dlog(lab)
    if (lab) {
      return this.taskTransfer(lab, RESOURCE_ENERGY) || this.taskWithdraw(this.room.terminal, RESOURCE_ENERGY)
    }
    return this.taskTransfer(this.room.terminal, RESOURCE_ENERGY)
  }

  taskNukerFill () {
    if (!this.room.terminal?.store[RESOURCE_GHODIUM]) return false
    const nuker = _.first(this.room.findStructs(STRUCTURE_NUKER))
    if (!nuker) return false
    if (nuker.ghodium >= nuker.ghodiumCapacity) return false

    return this.taskTransfer(nuker, RESOURCE_GHODIUM) || this.taskWithdraw(this.room.terminal, RESOURCE_GHODIUM)
  }

  taskLabFill () {
    for (const lab of this.room.findStructs(STRUCTURE_LAB)) {
      this.dlog('lab fill type:', lab.planType, 'fill:', lab.mineralFill())
      if (!this.room.terminal?.store[lab.planType]) continue
      if (!lab.mineralFill()) continue
      this.dlog('taskLabFill', lab.planType)
      return this.taskWithdraw(this.room.terminal, lab.planType)
    }
  }

  taskHarvestMinerals () {
    if (this.store.getFreeCapacity() < this.info.mineral) return false
    const extrs = this.room.findStructs(STRUCTURE_EXTRACTOR)
    if (!extrs.length) return false
    if (!this.room.terminal) return false
    if (this.room.controller.level < 6) return false
    const mineral = _.first(this.room.find(FIND_MINERALS))
    return this.taskHarvestMineral(mineral)
  }

  taskHarvestMineral (mineral) {
    mineral = this.checkId('harvest mineral', mineral)
    if (!mineral) return false

    if (this.store.getFreeCapacity() < this.info.mineral) return false

    if (this.store.getUsedCapacity() && this.ticksToLive < 2 * this.pos.getRangeTo(this.room.terminal)) {
      console.log('Emergency chemist dump')
      return this.taskTransferMinerals()
    }

    const err = this.harvest(mineral)
    if (err === OK) {
      this.intents.melee = this.intents.range = mineral
      return mineral.mineralAmount
    }
    if (err === ERR_TIRED) {
      return 'cooldown'
    }
    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(mineral)
    }
    if (err === ERR_NOT_ENOUGH_RESOURCES) {
      this.dlog(mineral, 'is empty')
      return false
    }
    console.log(`ERROR ${err}: ${this} harvest ${mineral}`)
    return false
  }

  taskSortMinerals () {
    const mineral = nonenergy(this.store)
    this.dlog('taskSortMinerals', mineral)
    if (!mineral) return false
    return this.taskSortMineral(mineral)
  }

  taskSortMineral (mineral) {
    const lab = this.room.labForMineral(mineral)
    this.dlog('labForMineral', lab, mineral)

    return this.taskTransferLab(lab, mineral) ||
        this.taskTransfer(this.room.terminal, mineral) ||
        this.taskTransfer(this.room.storage, mineral)
  }

  taskTransferLab (lab) {
    lab = this.checkId('transfer lab', lab)
    if (!lab) return false
    if (!this.store[lab.planType]) return false
    if (!lab.mineralFree) return false

    return this.goTransfer(lab, lab.mineralType || lab.planType)
  }

  taskWithdrawMinerals (store) {
    this.dlog(`withdraw minerals ${store}`)
    if (!store) return false
    const mineral = nonenergy(store.store)
    return this.taskWithdraw(store, mineral)
  }

  taskResortMinerals () {
    this.dlog('resort minerals')
    for (const lab of this.room.findStructs(STRUCTURE_LAB)) {
      this.dlog('resort minerals', lab, lab.planType, lab.mineralDrain())
      if (lab.mineralDrain()) {
        return this.taskWithdrawLab(lab)
      }
    }

    const store = this.home.storage
    if (store && store.store.getUsedCapacity() > store.store.energy) {
      return this.taskWithdrawMinerals(store)
    }

    const cont = this.pos.findClosestByRange(
        _.filter(this.room.myConts, c => c.store.getUsedCapacity() > c.store.energy))
    return this.taskWithdrawMinerals(cont)
  }
}
