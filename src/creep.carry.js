const lib = require('lib'); 
const util = require('util'); 

class CreepTransfer {
  idleTransferAny() {
    if (!this.carry.energy) return false;
    if (this.intents.transfer) return false;

    const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);

    const struct = _.find(
        spots, spot => spot.structure.energyFree || spot.structure.storeFree);

    return this.goTransfer(struct, RESOURCE_ENERGY, false);
  }

  idleTransferExtra() {
    if (!this.carry.energy) return false;
    if (this.intents.transfer) return false;

    const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);

    for (let spot of spots) {
      const s = spot.structure;
      switch (s.structureType) {
        case STRUCTURE_CONTAINER:
          if (!this.room.energyFreeAvailable && s.mode === 'sink') {
            return this.goTransfer(s, RESOURCE_ENERGY, false);
          }
          break;
        case STRUCTURE_TOWER:
          if (this.room.energyFreeAvailable) break;
        // fallthrough
        case STRUCTURE_SPAWN:
        case STRUCTURE_EXTENSION:
          if (s.energyFree) {
            return this.goTransfer(s, RESOURCE_ENERGY, false);
          }
      }
    }
    return false;
  }

  taskTransferTowers(amount) {
    const towers = this.room.findStructs(STRUCTURE_TOWER);
    const tower = _.find(towers, t => t.energy < amount);
    return this.taskTransfer(tower, RESOURCE_ENERGY);
  }

  taskTransferPool() {
    this.dlog('taskTransferPool');
    if (!this.room.energyFreeAvailable) return false;

    const extns = _.filter(
        this.room.findStructs(STRUCTURE_EXTENSION),
        p => p.energyFree);
    const extn = this.pos.findClosestByRange(extns);

    // fill spawns last to give srcers a chance to fill them.
    const spawns = _.filter(
      this.room.findStructs(STRUCTURE_SPAWN),
        p => p.energyFree);
    const spawn = this.pos.findClosestByRange(spawns);

    return this.taskTransfer(extn || spawn, RESOURCE_ENERGY);
  }

  taskTransferMinerals() {
    this.dlog('taskTransferMinerals');
    const store = this.room.terminal || this.room.storage;
    if (!store) return false;

    const mineral = _.find(_.keys(this.carry), m => m !== RESOURCE_ENERGY);

    return this.taskTransfer(store, mineral);
  }

  taskTransferEnergy() {
    this.dlog('taskTransferEnergy');
    let stores = this.room.findStructs(
        STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL);
    stores = _.filter(stores, s => s.storeFree * 2 > this.carry.energy);

    const store = this.pos.findClosestByRange(stores);
    this.dlog('closest store', store);

    const batteries = _.filter(
        this.room.find(FIND_STRUCTURES),
        b => b.energyFree * 2 > this.carry.energy);

    const battery = this.pos.findClosestByRange(batteries);

    if (store) {
      if (battery && this.pos.getRangeTo(battery) <= this.pos.getRangeTo(store)) {
        return this.taskTransfer(battery, RESOURCE_ENERGY);
      }
      return this.taskTransferStore(store, RESOURCE_ENERGY);
    }
    return this.taskTransfer(battery, RESOURCE_ENERGY);
  }

  taskTransferResources() {
    this.dlog('taskTransferResources');
    const resource = util.randomResource(this.carry);
    switch(resource) {
      case RESOURCE_ENERGY:
        return this.taskTransferEnergy();
      case RESOURCE_POWER:
        const ps = _.first(this.findActive(STRUCTURE_NUKER));
        return this.taskTransfer(ps, resource) || this.taskTransferMineral(resource);
      case RESOURCE_GHODIUM:
        const nuker = _.first(this.findActive(STRUCTURE_NUKER));
        return this.taskTransfer(nuker, resource) || this.taskTransferMineral(resource);
    }
    return this.taskTransferMinerals(resource);
  }

  taskTransferStore(struct, resource) {
    struct = this.checkId('transfer store', struct);
    if (!struct) return false;
    if (!struct.storeFree) return false;
    return this.taskTransferHelper(struct, resource);
  }

  taskTransfer(struct, resource) {
    struct = this.checkId('transfer', struct);
    if (!struct) return false;
    if (struct[resource] >= struct[_.camelCase(resource + ' capacity')]) return false;
    return this.taskTransferHelper(struct, resource);
  }

  taskTransferHelper(struct, resource) {
    if (!resource) {
      resource = this.memory.task.resource;
    } else {
      this.memory.task.resource = resource;
    }

    if (!this.carry[resource]) return false;
    return this.goTransfer(struct, resource);
  }

  goTransfer(target, resource, move = true) {
    this.dlog('goTransfer', target, resource);
    const err = this.transfer(target, resource);
    if (err === OK) {
      this.intents.transfer = target;
      return 'success';
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(target);
    }
    this.dlog('goTransfer error!', err);
    return false;
  }
}

lib.merge(Creep, CreepTransfer);

class CreepWithdraw {
  idleWithdrawExtra() {
    if (!this.carryFree) return false;
    if (this.intents.withdraw) return false;

    const spots =
        _.shuffle(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true));

    for (let spot of spots) {
      const s = spot.structure;
      switch (s.structureType) {
        case STRUCTURE_CONTAINER:
          if (s.mode === 'src' && s.store.energy) {
            return this.goWithdraw(s, RESOURCE_ENERGY, false);
          }
          break;
        case STRUCTURE_LINK:
          if (s.mode === 'src' && s.energy) {
            return this.goWithdraw(s, RESOURCE_ENERGY, false);
          }
          break;
        case STRUCTURE_STORAGE:
          if (s.store.energy > 100000) {
            return this.goWithdraw(s, RESOURCE_ENERGY, false);
          }
          break;
      }
    }
    return false;
  }

  idleRecharge() {
    if (this.carryFree < this.carry.energy) return false;
    if (this.intents.withdraw) return false;

    const spots =
        _.shuffle(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true));

    for (let spot of spots) {
      const s = spot.structure;
      switch (spot.structure.structureType) {
        case STRUCTURE_LAB:
        case STRUCTURE_LINK:
          if (s.energy) return this.goWithdraw(s, RESOURCE_ENERGY, false);
          break;
        case STRUCTURE_STORAGE:
        case STRUCTURE_TERMINAL:
        case STRUCTURE_CONTAINER:
          if (s.store.energy) return this.goWithdraw(s, RESOURCE_ENERGY, false);
          break;
      }
    }
    return false;
  }

  taskRecharge() {
    let anyE = [];
    let goodE = [];
    const limit = this.carryFree / 2;

    for (let r of this.room.find(FIND_DROPPED_RESOURCES)) {
      if (r.resourceType !== RESOURCE_ENERGY) continue;
      if (this.pos.inRangeTo(r, r.amount)) continue;
      if (r.amount < limit) {
        anyE.push(r);
      } else {
        goodE.push(r);
      }
    }

    for (let s of this.room.findStructs(STRUCTURE_LINK, STRUCTURE_LAB)) {
      if (s.energy >= limit) {
        goodE.push(s);
      } else if (s.energy) {
        anyE.push(s);
      }
    }

    for (let s of this.room.findStructs(
             STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL)) {
      if (s.store.energy >= limit) {
        goodE.push(s);
      } else if (s.store.energy) {
        anyE.push(s);
      }
    }

    this.dlog('goodE', goodE);
    let e = this.pos.findClosestByRange(goodE);
    if (!e) {
      e = this.pos.findClosestByRange(anyE);
    }
    if (!e) {
      this.dlog('recharge fail');
      return false;
    }

    this.dlog('recharge from', e);

    switch (e.structureType) {
      case STRUCTURE_CONTAINER:
      case STRUCTURE_STORAGE:
      case STRUCTURE_TERMINAL:
        return this.taskWithdrawStore(e, RESOURCE_ENERGY);
      case STRUCTURE_LAB:
      case STRUCTURE_LINK:
        return this.taskWithdraw(e, RESOURCE_ENERGY);
      default:
        return this.taskPickup(e);
    }
  }

  taskWithdraw(struct, resource) {
    struct = this.checkId('withdraw', struct);
    if (!struct) return false;
    if (!this.carryFree) return false;

    if (!resource) {
      resource = this.memory.task.resource;
    } else {
      this.memory.task.resource = resource;
    }

    if(!struct[resource]) return false;

    return this.goWithdraw(struct, resource);
  }

  taskWithdrawStore(struct, resource) {
    struct = this.checkId('withdraw store', struct);
    if (!struct) return false;
    if (!this.carryFree) return false;

    if (!resource) {
      resource = this.memory.task.resource;
    } else {
      this.memory.task.resource = resource;
    }
    if (!struct.store[resource]) return false;

    return this.goWithdraw(struct, resource);
  }

  goWithdraw(target, resource, move = true) {
    this.dlog('goWithdraw', target, resource);
    const err = this.withdraw(target, resource);
    if (err === OK) {
      this.intents.withdraw = target;
      return 'success';
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(target);
    }
    this.dlog('goWithdraw error!', err);
    return false;
  }
}

lib.merge(Creep, CreepWithdraw);

class CreepPickup {
  idleNomNom() {
    if (!this.carryFree) return false;
    if (this.intents.pickup) return false;

    const spot =
        _.sample(this.room.lookForAtRange(LOOK_RESOURCES, this.pos, 1, true));
    return this.goPickup(spot && spot.resource, false);
  }

  idleNom() {
    if (!this.carryFree) return false;
    if (this.intents.pickup) return false;

    const spot =
        _.sample(this.room.lookForAtRange(LOOK_ENERGY, this.pos, 1, true));
    if (spot && spot.energy.resourceType !== RESOURCE_ENERGY) {
      console.log('Non-Energy!', spot.energy);
    }
    return this.goPickup(spot && spot.energy, false);
  }

  taskPickupAny() {
    const resource = _.find(
        this.room.find(FIND_DROPPED_RESOURCES),
        r => this.pos.inRangeTo(r, r.amount) &&
            (this.room.terminal || r.resourceType === RESOURCE_ENERGY));
    return this.taskPickup(resource);
  }

  taskPickup(resource) {
    resource = this.checkId('pickup', resource);
    if (!resource) return false;
    if (!this.pos.inRangeTo(resource, resource.amount)) return false;
    if (!this.carryFree) return false;

    return this.goPickup(resource);
  }

  goPickup(resource, move = true) {
    const err = this.pickup(resource);
    if (err === OK) {
      this.intents.pickup = resource;
      return 'success';
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveNear(resource);
    }
    return false;
  }

  taskDrop(flag) {
    if (!this.carry.energy) return false;
    flag = this.checkFlag('drop', flag);
    if (!flag) return false;

    if (this.pos.isNearTo(flag)) {
      const err = this.drop(RESOURCE_ENERGY);
      return err === OK && 'success';
    }

    return this.idleMoveTo(flag);
  }
}

lib.merge(Creep, CreepPickup);
