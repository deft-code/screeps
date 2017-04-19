const lib = require('lib');

class Container {
  calcMode() {
    if (this.room.storage && this.pos.inRangeTo(this.room.storage, 2)) {
      return 'buffer';
    }

    const src = this.room.find(FIND_SOURCES, src => this.pos.inRangeTo(src, 2));
    if (src) return 'src';

    const mineral = this.room.find(
        FIND_MINERALS, mineral => this.pos.inRangeTo(mineral, 2));
    if (mineral) return 'src';

    return 'sink'
  }

  get source() {
    if (_.isUndefined(this.memory.source)) {
      let srcs = this.pos.findInRange(FIND_SOURCES, 1);
      let mines = this.pos.findInRange(FIND_MINERALS, 1);
      this.memory.source = srcs.length > 0 || mines.length > 0;
    }
    return this.memory.source;
  }

  get mode() {
    if (!this.room.memory.containers) {
      this.room.memory.containers = {};
    }
    let mem = this.room.memory.containers[this.id];
    if (!mem) {
      mem = this.room.memory.containers[this.id] = {
        note: this.note,
        mode: this.calcMode(),
      };
      console.log('calculating contianer mode', JSON.stringify(mem));
    }
    return mem.mode;
  }
}

lib.merge(StructureContainer, Container);
