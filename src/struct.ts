import { extender } from 'roomobj';

declare global {
  interface Structure {
    storeTotal: number
    obstacle: boolean
    hurts: number
  }
}

@extender
class StructureExtra extends Structure {
  get note() {
    let t: string = this.structureType
    switch (t) {
      case STRUCTURE_WALL:
        t = 'wall'
        break
      case STRUCTURE_EXTENSION:
        t = 'extn'
        break
      case STRUCTURE_STORAGE:
        t = 'store'
        break
      case STRUCTURE_TERMINAL:
        t = 'term'
        break
      case STRUCTURE_CONTAINER:
        t = 'contnr'
        break
    }
    return t.slice(0, 6) + this.pos.xy;
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

  toString() {
    return `<a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.note}</a>`
  }
}
