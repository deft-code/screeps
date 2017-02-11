StructureContainer.prototype.calcMode = function() {
  if (this.room.storage && this.pos.inRangeTo(this.room.storage, 2)) {
    return 'buffer';
  }

  const src = this.room.find(FIND_SOURCES, src => this.pos.inRangeTo(src, 2));
  if(src) return 'src';

  const mineral = this.room.find(FIND_MINERALS, mineral => this.pos.inRangeTo(mineral, 2));
  if(mineral) return 'src';

  return 'sink'
};

StructureContainer.prototype.mode = function() {
  if(!this.room.memory.containers) {
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
};

