import { CreepMove } from "creep.move";
import * as k from 'constants';
import { TaskRet } from "Tasker";
import { isGenericStore, isStoreStruct } from "guards";
import { Link, Mode } from "struct.link";
import { injecter } from "roomobj";
import { errStr } from "debug";

declare global {
  interface ExtensionTick {
    taken?: string
  }

  interface CreepTaskMem {
    resource?: ResourceConstant
  }

  interface Creep {
    taskSortMineral(r: ResourceConstant): TaskRet
  }
}

export function randomResource(resources: GenericStore): ResourceConstant {
  const recs = _.keys(resources) as ResourceConstant[];
  if (resources[RESOURCE_ENERGY] > 0) return _.sample(recs);
  return _.sample(_.filter(recs, r => r !== RESOURCE_ENERGY));
}

@injecter(Creep)
export class CreepCarry extends CreepMove {
  idleTransferAny() {
    if (!this.store.energy) return false
    if (this.intents.transfer) return false

    const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true)

    const spot = _.find(
      spots, spot => isStoreStruct(spot.structure) && spot.structure.store.getFreeCapacity(RESOURCE_ENERGY))

    if (!spot) return false

    return this.goTransfer(spot[LOOK_STRUCTURES] as XferStruct, RESOURCE_ENERGY, false)
  }

  idleTransferExtra() {
    if (!this.store.energy) return false
    if (this.intents.transfer) return false

    const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true)

    for (let spot of spots) {
      const s = spot.structure
      switch (s.structureType) {
        // case STRUCTURE_CONTAINER:
        //  if (!this.room.energyFreeAvailable && s.mode === 'sink') {
        //    return this.goTransfer(s, RESOURCE_ENERGY, false)
        //  }
        //  break
        case STRUCTURE_TOWER:
          if (this.room.energyFreeAvailable > 0) break
        // fallthrough
        case STRUCTURE_SPAWN:
        case STRUCTURE_EXTENSION:
          if ((s as StructureExtension).store.getFreeCapacity(RESOURCE_ENERGY)) {
            return this.goTransfer(s as StructureExtension, RESOURCE_ENERGY, false)
          }
      }
    }
    return false
  }

  taskTransferTowers(amount: number) {
    const towers = this.room.findStructs(STRUCTURE_TOWER) as StructureTower[];
    const tower = _.find(towers, t => t.store.energy < amount)
    return this.taskTransfer(tower, RESOURCE_ENERGY)
  }

  taskTransferPool() {
    this.dlog('taskTransferPool')
    if (!this.room.energyFreeAvailable) return false

    const extns = _.filter(
      this.room.findStructs(STRUCTURE_EXTENSION) as StructureExtension[],
      p => p.store.getFreeCapacity(RESOURCE_ENERGY) && !p.tick.taken)
    const extn = this.pos.findClosestByRange(extns)

    if (extn) {
      extn.tick.taken = this.name
      return this.taskTransfer(extn, RESOURCE_ENERGY)
    }

    // fill spawns last to give srcers a chance to fill them.
    const spawns = _.filter(
      this.room.findStructs(STRUCTURE_SPAWN),
      p => p.store.getFreeCapacity(RESOURCE_ENERGY))
    const spawn = this.pos.findClosestByRange(spawns)

    return this.taskTransfer(spawn, RESOURCE_ENERGY)
  }

  taskTransferMinerals() {
    this.dlog('taskTransferMinerals')
    const store = this.room.terminal || this.room.storage
    if (!store) return false

    const mineral = _.find(_.keys(this.store) as ResourceConstant[], m => m !== RESOURCE_ENERGY);

    return this.taskTransfer(store, mineral)
  }

  taskTransferEnergy() {
    this.dlog('taskTransferEnergy')
    const batteries = _.filter(
      this.room.find(FIND_STRUCTURES),
      b => isStoreStruct(b) && b.store.getFreeCapacity(RESOURCE_ENERGY) * 2 > this.store.energy) as EnergyStruct[];

    const battery = this.pos.findClosestByRange(batteries)
    return this.taskTransfer(battery, RESOURCE_ENERGY)
  }

  taskTransferResources() {
    const resource = randomResource(this.store)
    switch (resource) {
      case RESOURCE_ENERGY:
        return this.taskTransferEnergy()
      case RESOURCE_POWER:
        const ps = _.first(this.room.findStructs(STRUCTURE_NUKER))
        return this.taskTransfer(ps, resource) || this.taskSortMineral(resource)
      case RESOURCE_GHODIUM:
        const nuker = _.first(this.room.findStructs(STRUCTURE_NUKER))
        return this.taskTransfer(nuker, resource) || this.taskSortMineral(resource)
    }
    return this.taskTransferMinerals();
  }

  taskTransfer(struct: XferStruct | undefined | null, resource: ResourceConstant | undefined) {
    struct = this.checkId('transfer', struct);
    this.dlog("checked", struct);
    if (!struct) return false;

    if (!resource) {
      resource = this.memory.task!.resource!;
    } else {
      this.memory.task!.resource = resource;
    }
    this.dlog("resource", resource);

    if (!this.store[resource]) return false;
    this.dlog("carrying");

    if (!struct.store.getFreeCapacity(resource)) return false;

    return this.goTransfer(struct, resource);
  }

  goTransfer(target: XferStruct, resource: ResourceConstant, move = true) {
    this.dlog('goTransfer', target, resource)
    const err = this.transfer(target, resource)
    if (err === OK) {
      this.intents.transfer = target
      return 'success'
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveNear(target)
    }
    this.dlog('goTransfer error!', errStr(err), target, resource)
    return false
  }

  idleWithdrawExtra() {
    if (!this.store.getFreeCapacity()) return false
    if (this.intents.withdraw) return false

    const spots =
      _.shuffle(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true))

    for (let spot of spots) {
      const s = spot.structure as XferStruct;
      switch (s.structureType) {
        case STRUCTURE_CONTAINER:
          if (s.mode === 'src' && s.store.energy) {
            return this.goWithdraw(s, RESOURCE_ENERGY, false)
          }
          break
        case STRUCTURE_LINK:
          if ((s as Link).mode === Mode.src && s.store.energy) {
            return this.goWithdraw(s, RESOURCE_ENERGY, false)
          }
          break
        case STRUCTURE_STORAGE:
          // Don't idle withdraw unless the creep is already carrying a little.
          // This prevents the creep from immediately withdrawing after
          // transfer.
          if (s.store.energy > k.EnergyReserve && this.store.energy) {
            return this.goWithdraw(s, RESOURCE_ENERGY, false)
          }
          break
      }
    }
    return false
  }

  idleRecharge() {
    if (this.store.getFreeCapacity() < this.store.energy) return false
    if (this.intents.withdraw) return false

    const spots = _.shuffle(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true))

    for (let spot of spots) {
      const s = spot.structure as XferStruct;
      if (s.structureType === STRUCTURE_SPAWN) continue
      if (s.structureType === STRUCTURE_EXTENSION) continue
      if (s.structureType === STRUCTURE_TOWER) continue
      if (isGenericStore(s) && s.store.energy) {
        return this.goWithdraw(s, RESOURCE_ENERGY, false)
      }
    }
    return false
  }

  taskRechargeLimit(limit: number) {
    this.dlog(`recharge ${limit}`)

    if (!this.store.getFreeCapacity()) return false

    let all: (Resource | Withdrawable)[] = []
    if (this.room.hostiles.length === 0 || limit < 10) {
      all = _.filter(
        this.room.find(FIND_DROPPED_RESOURCES),
        r => r.resourceType === RESOURCE_ENERGY && this.pos.inRangeTo(r, r.amount) && r.amount >= limit)
    }

    all = all.concat(_.filter(
      this.room.findStructs(
        STRUCTURE_CONTAINER,
        STRUCTURE_LAB,
        STRUCTURE_LINK,
        STRUCTURE_POWER_SPAWN,
        STRUCTURE_STORAGE,
        STRUCTURE_TERMINAL
      ) as XferStruct[],
      s => isStoreStruct(s) && s.store.energy >= limit
    ))

    let e = this.pos.findClosestByRange(all) as any;

    if (e && e.structureType) {
      return this.taskWithdraw(e, RESOURCE_ENERGY)
    }
    return this.taskPickup(e)
  }

  taskRecharge() {
    return this.taskRechargeLimit(this.store.getFreeCapacity() / 3) || this.taskRechargeLimit(1)
  }

  taskWithdrawAny() {
    if (!this.store.getFreeCapacity()) return false

    const structs = _.shuffle(this.room.find(FIND_STRUCTURES))
    for (const struct of structs) {
      const what = this.taskWithdrawResource(struct as XferStruct)
      if (what) return what
    }
    return false
  }

  taskWithdrawResource(struct: XferStruct) {
    if (!struct) return false
    switch (struct.structureType) {
      case STRUCTURE_CONTAINER:
      case STRUCTURE_TERMINAL:
      case STRUCTURE_STORAGE:
        if (!struct.store.getUsedCapacity()) return false
        return this.taskWithdraw(struct, randomResource(struct.store))
      case STRUCTURE_EXTENSION:
      case STRUCTURE_TOWER:
      case STRUCTURE_LINK:
        if (!struct.store.energy) return false
        return this.taskWithdraw(struct, RESOURCE_ENERGY)
      case STRUCTURE_LAB:
        return this.taskWithdrawLab(struct) ||
          this.taskWithdraw(struct, RESOURCE_ENERGY)
      case STRUCTURE_POWER_SPAWN:
        return this.taskWithdraw(struct, RESOURCE_POWER) ||
          this.taskWithdraw(struct, RESOURCE_ENERGY)
    }
    return false
  }

  taskWithdrawLab(lab: StructureLab | null) {
    lab = this.checkId('withdraw lab', lab)
    if (!lab) return false
    if (!lab.mineralAmount) return false
    if (!this.store.getFreeCapacity()) return false
    this.dlog('withdrawing', lab, lab.mineralAmount, lab.mineralType)

    return this.goWithdraw(lab, lab.mineralType!)
  }


  taskWithdraw(struct: Withdrawable | null, resource: ResourceConstant) {
    struct = this.checkId('withdraw', struct)
    if (!struct) return false
    if (!this.store.getFreeCapacity()) return false

    if (!resource) {
      resource = this.memory.task!.resource!;
    } else {
      this.memory.task!.resource = resource;
    }

    if (!struct.store[resource]) {
      this.dlog('empty store', struct)
      return false
    }

    return this.goWithdraw(struct, resource)
  }

  goWithdraw(target: Withdrawable, resource: ResourceConstant, move = true) {
    this.dlog('goWithdraw', target, resource)
    const err = this.withdraw(target, resource)
    if (err === OK) {
      this.intents.withdraw = target
      return 'success'
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.moveNear(target)
    }
    this.dlog('goWithdraw error!', err)
    return false
  }

  idleNomNom() {
    if (!this.store.getFreeCapacity()) return false
    if (this.intents.pickup) return false

    const spot = _.sample(this.room.lookForAtRange(LOOK_RESOURCES, this.pos, 1, true))
    if (spot) {
      return this.goPickup(spot[LOOK_RESOURCES], false)
    }

    const tomb = _.find(
      this.room.lookForAtRange(LOOK_TOMBSTONES, this.pos, 1, true),
      spot => spot[LOOK_TOMBSTONES].store.getUsedCapacity() > 0)
    if (tomb) {
      const t = tomb[LOOK_TOMBSTONES]
      return this.taskWithdraw(t, randomResource(t.store));
    }

    const ruin = _.find(
      this.room.lookForAtRange(LOOK_RUINS, this.pos, 1, true),
      spot => spot[LOOK_RUINS].store.getUsedCapacity() > 0)
    if (ruin) {
      const r = ruin[LOOK_RUINS]
      return this.taskWithdraw(r, randomResource(r.store));
    }
    return false
  }

  idleNom() {
    if (!this.store.getFreeCapacity()) return false
    if (this.intents.pickup) return false

    const spot = _.find(
      this.room.lookForAtRange(LOOK_RESOURCES, this.pos, 1, true),
      spot => spot[LOOK_RESOURCES].resourceType === RESOURCE_ENERGY)
    if (spot) {
      this.dlog(spot)
      return this.goPickup(spot[LOOK_RESOURCES], false)
    }

    const tomb = _.find(
      this.room.lookForAtRange(LOOK_TOMBSTONES, this.pos, 1, true),
      spot => spot[LOOK_TOMBSTONES].store[RESOURCE_ENERGY] > 0)
    if (tomb) {
      this.dlog(tomb)
      return this.goWithdraw(tomb[LOOK_TOMBSTONES], RESOURCE_ENERGY, false)
    }

    const ruin = _.find(
      this.room.lookForAtRange(LOOK_RUINS, this.pos, 1, true),
      spot => spot[LOOK_RUINS].store[RESOURCE_ENERGY] > 0)
    if (ruin) {
      const r = ruin[LOOK_RUINS]
      return this.goWithdraw(r, RESOURCE_ENERGY, false);
    }
    return false
  }

  taskPickupAny() {
    const resource = _.find(
      this.room.find(FIND_DROPPED_RESOURCES),
      r => {
        if (r.amount < 20) return false
        if (!this.pos.inRangeTo(r, r.amount)) return false
        if (this.room.controller && this.room.controller.my) {
          if (!this.room.terminal && r.resourceType !== RESOURCE_ENERGY) return false
        }
        return true
      }) || null;
    return this.taskPickup(resource);
  }

  taskPickup(resource: Resource | null) {
    resource = this.checkId('pickup', resource)
    if (!resource) return false
    if (!this.store.getFreeCapacity()) return false
    if (resource.amount < 50 && !this.pos.inRangeTo(resource, resource.amount)) return false

    const what = this.goPickup(resource)
    this.dlog('goPickup:', what)
    return what
  }

  goPickup(resource: Resource, move = true) {
    const err = this.pickup(resource)
    if (err === OK) {
      this.intents.pickup = resource
      return 'success'
    }
    if (err === ERR_NOT_IN_RANGE) {
      return move && this.moveNear(resource)
    }
    return false
  }

  taskDrop(flag: Flag | null) {
    if (!this.store.energy) return false
    flag = this.checkFlag('drop', flag)
    if (!flag) return false

    if (this.pos.isNearTo(flag)) {
      const err = this.drop(RESOURCE_ENERGY)
      return err === OK && 'success'
    }

    return this.moveNear(flag)
  }
}
