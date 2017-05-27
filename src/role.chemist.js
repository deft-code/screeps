const lib = require('lib');

function nonenergy(carry) {
  return _.max(_.keys(carry), k => {
    if(k=== RESOURCE_ENERGY) return -1;
    return carry[k];
  });
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
    return this.taskTask() || 
      this.taskMoveRoom(this.team) ||
      this.taskResortMinerals() ||
      this.taskHarvestMinerals() ||
        this.taskTransferMinerals();
  }

  taskHarvestMinerals() {
    this.dlog('harvest minerals info', this.info.mineral);
    if(this.carryFree < this.info.mineral) return false;
    const extrs = this.room.findStructs(STRUCTURE_EXTRACTOR);
    if(!extrs.length) return false;
    if(!this.room.terminal) return false;
    if(this.room.controller.level < 6) return false;
    const mineral = _.first(this.room.find(FIND_MINERALS));
    return this.taskHarvestMineral(mineral);
  }

  taskHarvestMineral(mineral) {
    mineral = this.checkId('harvest mineral', mineral);
    if(!mineral) return false;

    if(this.carryFree < this.info.mineral) return false;

    if(this.carryTotal && this.ticksToLive < 2*this.pos.getRangeTo(this.room.terminal)) {
      console.log("Emergency chemist dump");
      return this.taskTransferMinerals();
    }

    const err = this.harvest(mineral);
    if(err === OK) {
      this.intents.melee = this.intents.range = mineral;
      return mineral.mineralAmount;
    }
    if(err === ERR_TIRED) {
      return 'cooldown';
    }
    if(err === ERR_NOT_IN_RANGE) {
      return this.moveNear(mineral);
    }
    console.log(`ERROR ${err}: ${this} harvest ${mineral}`);
    return false;
  }

  taskTransferMinerals() {
    const mineral = nonenergy(this.carry);
    if (!mineral) return false;
    return this.taskTransferMineral(mineral);
  }

  taskTransferMineral(mineral) {
    const lab = this.room.labForMineral(mineral);

    return this.taskTransferLab(this.room.labForMineral(mineral)) ||
        this.taskTransfer(this.room.myTerminal, mineral) ||
        this.taskTransfer(this.room.myStorage, mineral) ||
        this.taskTransfer(this.room.contForMineral(mineral));
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
    this.dlog(`withdraw mineral ${store}`);
    if (!store) return false;
    const mineral = nonenergy(store.store);
    return this.taskWithdraw(store, mineral);
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
