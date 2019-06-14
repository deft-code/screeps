import * as util from 'util';
import { extender } from 'roomobj';

declare global {
  interface Structure {
    storeTotal: number
    storeFree: number
    energyFree: number
    obstacle: boolean
    hurts: number
  }
}

@extender
class StructureExtra extends Structure {
  get note() {
    return util.structNote(this.structureType, this.pos)
  }

  get xy() {
    return this.room.packPos(this.pos)
  }

  get storeTotal(this: StoreStructure) {
    return _.sum(this.store)
  }

  get storeFree(this: StoreStructure) {
    return Math.max(0, this.storeCapacity - this.storeTotal)
  }

  get energyFree(this: EnergyStruct) {
    return Math.max(0, this.energyCapacity - this.energy)
  }

  get obstacle() {
    return _.contains(OBSTACLE_OBJECT_TYPES, this.structureType)
  }

  get hurts() {
    return this.hitsMax - this.hits
  }

  get repairs() {
    let myMax = this.hitsMax
    switch (this.structureType) {
      case STRUCTURE_RAMPART:
      case STRUCTURE_WALL:
        myMax = Math.min(
          this.hitsMax,
          this.room!.controller!.level * 10000 +
          Math.pow(10, this.room!.controller!.level - 1))
        break
      case STRUCTURE_ROAD:
        myMax = this.hitsMax / 5
        break
    }
    return 1 - (this.hits / myMax)
  }

  toString() {
    return util.structNote(this.structureType, this.pos) + ':' + this.pos.roomName;
  }
}
