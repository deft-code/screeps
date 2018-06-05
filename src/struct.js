const lib = require('lib')
const util = require('util')

class StructureExtra {
  get note () {
    return util.structNote(this.structureType, this.pos)
  }

  get xy () {
    return this.room.packPos(this.pos)
  }

  get storeTotal () {
    return _.sum(this.store)
  }

  get storeFree () {
    return Math.max(0, this.storeCapacity - this.storeTotal)
  }

  get energyFree () {
    return Math.max(0, this.energyCapacity - this.energy)
  }

  get obstacle () {
    return _.contains(OBSTACLE_OBJECT_TYPES, this.structureType)
  }

  get hurts () {
    return this.hitsMax - this.hits
  }

  get repairs () {
    let myMax = this.hitsMax
    switch (this.structureType) {
      case STRUCTURE_RAMPART:
      case STRUCTURE_WALL:
        myMax = Math.min(
            this.hitsMax,
            this.room.controller.level * 10000 +
                Math.pow(10, this.room.controller.level - 1))
        break
      case STRUCTURE_ROAD:
        myMax = this.hitsMax / 5
        break
    }
    return 1 - (this.hits / myMax)
  }
}

lib.merge(Structure, StructureExtra)
