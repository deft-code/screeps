const lib = require('lib')

class Container {
  calcMode () {
    if (_.any(this.room.find(FIND_SOURCES), src => this.pos.inRangeTo(src, 2))) {
      return 'src'
    }

    if (_.any(this.room.find(FIND_MINERALS), src => this.pos.inRangeTo(src, 2))) {
      return 'src'
    }
    return 'sink'
  }

  get mode () {
    if (!this.room.memory.containers) {
      this.room.memory.containers = {}
    }
    let mem = this.room.memory.containers[this.id]
    if (!mem) {
      mem = this.room.memory.containers[this.id] = {
        note: this.note,
        mode: this.calcMode()
      }
      console.log('calculating contianer mode', JSON.stringify(mem))
    }
    return mem.mode
  }
}

lib.merge(StructureContainer, Container)
