const lib = require('lib');

function nonenergy(carry) {
  return _(_.keys(carry)).filter(k => k != RESOURCE_ENERGY).sample();
}

Room.prototype.labForMineral = function(mineral) {
  for (let lab of this.findStructs(STRUCTURE_LAB)) {
    if (lab.memory.planType === mineral && lab.mineralFree) {
      return lab;
    }
  }
  for (let lab of this.findStructs(STRUCTURE_LAB)) {
    if (!lab.memory.planType) {
      lab.memory.planType = mineral;
      return lab;
    }
  }
  return;
};

Room.prototype.contForMineral = function(mineral) {
  const conts = _.filter(this.findStructs(STRUCTURE_CONTAINTER), 'storeFree');
  return _.find(conts, cont => cont.store[mineral]) ||
      _.find(conts, cont => cont.mode === 'sink') || _.first(conts);
};

class CreepChemist {
  roleChemist() {
    return this.taskTask() || this.taskResortMinerals() ||
        this.taskSortAllMinerals();
  }

  taskTransferMinerals() {
    const mineral = nonenergy(this.carry);
    if (!mineral) return false;
    return this.taskTransferMineral(mineral);
  }

  taskTransferMineral(mineral) {
    const lab = this.room.labForMineral(mineral);

    return this.taskTransferLab(this.room.labForMineral(mineral)) ||
        this.taskTransferStore(this.room.myTerminal, mineral) ||
        this.taskTransferStore(this.room.myStorage, mineral) ||
        this.taskTransferStore(this.room.contForMineral(mineral));
  }

  taskTransferLab(lab) {
    lab = this.checkId('transfer lab', lab);
    if (!lab) return false;
    if (!this.carry[lab.planType]) return false;
    if (!lab.mineralFree) return false;

    return this.goTransfer(lab, lab.mineralType);
  }

  taskWithdrawLab(lab) {
    lab = this.checkId('withdraw lab', lab);
    if (!lab) return false;
    if (!lab.mineralAmount) return false;
    if (!this.carryFree) return false;

    return this.goWithdraw(lab, lab.mineralType);
  }

  taskWithdrawMinerals(store) {
    if (!store) return false;
    const mineral = nonenergy(store.store);
    return this.taskWithdrawStore(store, mineral);
  }

  taskResortMinerals() {
    for (let lab of this.room.myLabs) {
      if (lab.mineralAmount && lab.mineralType != lab.memory.planType) {
        return this.taskWithdrawLab(lab);
      }
    }

    const store = this.home.storage;
    if (store && store.storeTotal > store.store.energy) {
      return this.taskWithdrawMinerals(store);
    }

    const cont = this.pos.findClosestByRange(
        _.filter(this.room.myConts, c => c.storeTotal > c.store.energy));
    return this.taskWithdrawMinerals(cont);
  }
}

lib.merge(Creep, CreepChemist);
