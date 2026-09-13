import * as lib from 'lib';

// Bump when calcMode changes so memoised modes are recomputed.
const kModeVersion = 2

class Container {
  // src: within 2 of a source or mineral (drop-mining buffer, haulers drain it).
  // sink: within 4 of the controller (upgrader buffer, haulers fill it and
  //       only withdraw from it when nothing else in the room has energy).
  // hub: anything else (haulers fill it, never drain it).
  calcMode () {
    if (_.any(this.room.find(FIND_SOURCES), src => this.pos.inRangeTo(src, 2))) {
      return 'src'
    }

    if (_.any(this.room.find(FIND_MINERALS), src => this.pos.inRangeTo(src, 2))) {
      return 'src'
    }

    const ctrl = this.room.controller
    if (ctrl && this.pos.inRangeTo(ctrl, 4)) {
      return 'sink'
    }
    return 'hub'
  }

  get mode () {
    if (!this.room.memory.containers) {
      this.room.memory.containers = {}
    }
    let mem = this.room.memory.containers[this.id]
    if (!mem || mem.v !== kModeVersion) {
      mem = this.room.memory.containers[this.id] = {
        v: kModeVersion,
        mode: this.calcMode()
      }
      console.log('calculating container mode', this.pos, JSON.stringify(mem))
    }
    return mem.mode
  }
}

lib.merge(StructureContainer, Container)
