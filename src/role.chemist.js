const modutil = require('util');

modutil.cachedProp(StructureLab, 'planType', (lab) => lab.memory.planType);

modutil.cachedProp(
    StructureLab, 'mineralFree',
    (lab) => lab.mineralCapacity - lab.mineralAmount);

function nonenergy(carry) {
  return _(_.keys(carry)).filter(k => k != RESOURCE_ENERGY).sample();
}

Room.prototype.labForMineral = function(mineral) {
  for (let lab of this.labs) {
    if (lab.memory.planType === mineral && lab.mineralFree) {
      return lab;
    }
  }
  for (let lab of this.labs) {
    if (!lab.memory.planType) {
      lab.memory.planType = mineral;
      return lab;
    }
  }
  return;
};

Creep.prototype.roleChemist = function() {
  return this.actionTask() || this.actionResortMinerals() ||
      this.actionSortAllMinerals();
};

Creep.prototype.actionSortAllMinerals = function() {
  const mineral = nonenergy(this.carry);
  return this.actionSortMineral(mineral);
};

Creep.prototype.actionSortMineral = function(mineral) {
  const lab = this.home.labForMineral(mineral);
  if (lab) {
    this.actionStoreLab(lab, mineral);
  }
  return this.actionStoreMinerals();
};

Creep.prototype.actionStoreLab = function(lab, mineral) {
  if (!lab || !mineral) {
    return false;
  }
  this.memory.task = {
    task: 'store lab',
    id: lab.id,
    mineral: mineral,
    note: lab.note,
  };
  return this.taskStoreLab();
};

Creep.prototype.taskStoreLab = function() {
  const lab = this.taskId;
  const mineral = this.task.mineral;

  if (!lab) {
    return false;
  }

  if (lab.mineralType != mineral && lab.mineralAmount) {
    return false;
  }

  if (!lab.mineralFree) {
    return false;
  }

  if (!this.carryTotal) {
    return false;
  }

  const err = this.transfer(lab, mineral);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(lab);
  }
  if (err == OK) {
    return 'success';
  }
  return false;
};

Creep.prototype.actionResortMinerals = function() {
  const labs = this.home.findStructs(STRUCTURE_LAB);
  for (let lab of labs) {
    if (lab.mineralAmount && lab.mineralType != lab.memory.planType) {
      return this.actionWithdrawLab(lab);
    }
  }

  const store = this.home.storage;
  if (store && store.storeTotal > store.store.energy) {
    return this.actionWithdrawMinerals(store);
  }

  const cont = this.pos.findClosestByRange(_.filter(
      this.home.findStructs(STRUCTURE_CONTAINER),
      c => c.storeTotal > c.store.energy));
  return this.actionWithdrawMinerals(cont);
};

Creep.prototype.actionWithdrawMinerals = function(store) {
  if (!store) {
    return false;
  }
  const mineral =
      nonenergy(store.store) return this.actionWithdraw(store, mineral);
};

Creep.prototype.actionWithdrawLab = function(lab) {
  if (!lab) {
    return false;
  }
  this.memory.task = {
    task: 'withdraw lab',
    mineral: lab.mineralType,
    id: lab.id,
    note: lab.note,
  };
  return this.taskWithdrawLab();
};

Creep.prototype.taskWithdrawLab = function() {
  const lab = this.taskId;
  if (!lab || lab.mineralType !== this.memory.task.mineral ||
      !lab.mineralAmount) {
    return false;
  }
  if (!this.carryFree) {
    return false;
  }
  const err = this.withdraw(lab, this.memory.task.mineral);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(lab);
  }
  if (err == OK) {
    return 'success';
  }
  return false;
};
