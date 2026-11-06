import { extender } from 'roomobj';

// Bump when calcMode changes so memoised modes are recomputed.
const kModeVersion = 2

export type ContainerMode = "src" | "sink" | "hub"

declare global {
  interface RoomMemory {
    // Memoised container modes by structure id (StructureContainer.mode).
    containers?: {
      [id: string]: { v: number, mode: ContainerMode }
    }
  }
}

// `mode` is declared on StructureContainer in types.d.ts.
@extender
class Container extends StructureContainer {
  // src: within 2 of a source or mineral (drop-mining buffer, haulers drain it).
  // sink: within 4 of the controller (upgrader buffer, haulers fill it and
  //       only withdraw from it when nothing else in the room has energy).
  // hub: anything else (haulers fill it, never drain it).
  calcMode (): ContainerMode {
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

  get mode (): ContainerMode {
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
