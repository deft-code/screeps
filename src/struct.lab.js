const lib = require('lib');

class LabExtra {
  get planType() {
    return this.memory.planType;
  }

  get mineralFree() {
    return this.mineralCapacity - this.mineralAmount;
  }

  get memory() {
    const labmem = this.room.memory.labs;
    let mem = labmem[this.id];
    if (!mem) {
      mem = labmem[this.id] = {
        note: this.note,
      };
      console.log('Creating lab memory for:', this.note);
    }
    return mem;
  }

  run() {}
}

lib.merge(StructureLab, LabExtra);

Room.prototype.runLabs = function() {
  if (!this.memory.labs) {
    this.memory.labs = {};
    console.log('Creating memory for labs in', this.name);
  }
  for (let lab of this.findStructs(STRUCTURE_LAB)) {
    lab.run();
  }
};
