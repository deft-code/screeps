const util = require('util'); 

module.exports = class CreepCarry {
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
      return this.taskTransfer(store, RESOURCE_ENERGY);
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

  taskTransfer(struct, resource) {
    struct = this.checkId('transfer', struct);
    if (!struct) return false;

    if (!resource) {
      resource = this.memory.task.resource;
    } else {
      this.memory.task.resource = resource;
    }

    if(!this.carry[resource]) return false;

    if(struct.store) {
      if(!struct.storeFree) return false;
    } else {
      const r = struct[resource];
      const rCap = struct[`${resource}Capacity`];
      if (r >= rCap) return false;
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
      return this.moveNear(target);
    }
    this.dlog('goTransfer error!', err);
    return false;
  }

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

    const spots = _.shuffle(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true));

    for (let spot of spots) {
      const s = spot.structure;
      if(s.structureType === STRUCTURE_SPAWN) continue;
      if(s.structureType === STRUCTURE_EXTENSION) continue;
      if(s.structureType === STRUCTURE_TOWER) continue;
      if(s.store && s.store.energy || s.energy) {
        return this.goWithdraw(s, RESOURCE_ENERGY, false);
      }
    }
    return false;
  }

  taskRechargeLimit(limit) {
    this.dlog(`recharge ${limit}`);

    if(!this.carryFree) return false;

    let all = _.filter(
      this.room.find(FIND_DROPPED_RESOURCES),
      r => r.resourceType === RESOURCE_ENERGY && this.pos.inRangeTo(r, r.amount) && r.amount >= limit);
    

    all = all.concat(_.filter(
      this.room.findStructs(
        STRUCTURE_CONTAINER,
        STRUCTURE_LAB,
        STRUCTURE_LINK,
        STRUCTURE_NUKER,
        STRUCTURE_POWER_SPAWN,
        STRUCTURE_STORAGE,
        STRUCTURE_TERMINAL
      ),
      s => s.store && s.store.energy >= limit || s.energy >= limit
    ));

    let e = this.pos.findClosestByRange(all);

    if(e && e.structureType) {
      return this.taskWithdraw(e, RESOURCE_ENERGY);
    }
    return this.taskPickup(e);
  }

  taskRecharge() {
    return this.taskRechargeLimit(this.carryFree/3) || this.taskRechargeLimit(1);
  }

  taskWithdrawAny() {
    if(!this.carryFree) return false;

    const structs = _.shuffle(this.room.find(FIND_STRUCTURES));
    for(const struct of structs) {
      const what = this.taskWithdrawResource(struct);
      if(what) return what;
    }
    return false;
  }

  taskWithdrawResource(struct) {
    if(!struct) return false;
    switch(struct.structureType) {
      case STRUCTURE_CONTAINER:
      case STRUCTURE_TERMINAL:
      case STRUCTURE_STORAGE:
        if(!struct.storeTotal) return false;
        return this.taskWithdraw(struct, util.randomResource(struct.store));
      case STRUCTURE_EXTENSION:
      case STRUCTURE_TOWER:
      case STRUCTURE_LINK:
        if(!struct.energy) return false;
        return this.taskWithdraw(struct, RESOURCE_ENERGY);
      case STRUCTURE_LAB:
        return this.taskWithdrawLab(struct) ||
          this.taskWithdraw(struct, RESOURCE_ENERGY);
      case STRUCTURE_POWER_SPAWN:
        return this.taskWithdraw(struct, RESOURCE_POWER) ||
          this.taskWithdraw(struct, RESOURCE_ENERGY);
      case STRUCTURE_NUKER:
        return this.taskWithdraw(struct, RESOURCE_GHODIUM) ||
          this.taskWithdraw(struct, RESOURCE_ENERGY);
    }
    return false;
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

    if (struct.store) {
      if(!struct.store[resource]) {
        this.dlog("empty store", struct);
        return false;
      }
    } else if(!struct[resource]) {
      return false;
    }

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
      return this.moveNear(target);
    }
    this.dlog('goWithdraw error!', err);
    return false;
  }

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

    const spot = _.sample(this.room.lookForAtRange(LOOK_ENERGY, this.pos, 1, true));
    return this.goPickup(spot && spot[LOOK_ENERGY], false);
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
      return this.moveNear(resource);
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

    return this.moveNear(flag);
  }
}
