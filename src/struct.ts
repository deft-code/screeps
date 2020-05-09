import { extender } from 'roomobj';

declare global {
  interface Structure {
    storeTotal: number
    obstacle: boolean
    hurts: number
  }
}

export function stype6(stype: StructureConstant) {
  switch (stype) {
    case STRUCTURE_WALL:
      return 'wall'
    case STRUCTURE_EXTENSION:
      return 'extn'
    case STRUCTURE_STORAGE:
      return 'store'
    case STRUCTURE_TERMINAL:
      return 'term'
    case STRUCTURE_CONTAINER:
      return 'contnr'
  }
  return stype.slice(0, 6)
}

@extender
class StructureExtra extends Structure {
  get note() { return stype6(this.structureType) + this.pos.xy; }
  toString() {
    return `<a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.note}</a>`;
  }

  get xy() {
    return this.room.packPos(this.pos)
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

}
