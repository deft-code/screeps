const util = require('util');

util.roProp(StructureLab, 'memory', (lab) => {
  const labmem = lab.room.memory.labs;
  let mem = labmem[lab.id];
  if(!mem) {
    mem = labmem[lab.id] = {
      note: lab.note,
    };
    console.log('Creating lab memory for:', lab.note);
  }
});

StructureLab.prototype.run = function() {
};

Room.prototype.runLabs = function() {
  if (!this.memory.labs) {
    this.memory.labs = {};
    console.log('Creating memory for labs in', this.name);
  }
  for(let lab of this.findStructs(STRUCTURE_LAB)) {
    lab.run();
  }
};
