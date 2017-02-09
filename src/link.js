StructureLink.prototype.calcMode = function() {
  if (this.room.storage && this.pos.inRangeTo(this.room.storage, 2)) {
    return 'buffer';
  }

  if (this.pos.inRangeTo(this.room.controller, 4)) {
    return 'sink';
  }
  return 'src'
};

StructureLink.prototype.mode = function() {
  let mem = this.room.memory.links[this.id];
  if (!mem) {
    mem = this.room.memory.links[this.id] = {
      note: this.note,
      mode: this.calcMode(),
    };
    console.log('calculating link mode', JSON.stringify(mem));
  }
  return mem.mode;
};

StructureLink.prototype.xferHalf = function(target) {
  const e = Math.floor(target.energyFree / 2);
  return this.xferRaw(target, e);
};

StructureLink.prototype.xfer = function(target, mod = 100) {
  let e = Math.min(this.energy, target.energyFree * (1 + LINK_LOSS_RATIO));
  e -= e % mod;
  return this.xferRaw(target, e);
};

StructureLink.prototype.xferAll = function(target) {
  return this.xfer(target, 1);
};

StructureLink.prototype.xferRaw = function(target, energy) {
  const err = this.transferEnergy(target, energy);
  if (err == OK) {
    target.energy += Math.floor(energy * (1 - LINK_LOSS_RATIO));
    this.energy -= energy;
  }
  return `xfer ${err}`;
};

StructureLink.prototype.run =
    function() {
  if (this.cooldown) return `cooldown ${this.cooldown}`;
  if (this.energy < 100) return `empty ${this.energy}`;

  switch (this.mode()) {
    case 'sink':
      return 'sink';
    case 'src':
      return this.runSrc();
    case 'buffer':
      return this.runBuffer();
  }
  return `bad mode ${this.mode()}`;
}

    StructureLink.prototype.runSrc = function() {
  const links = this.room.findStructs(STRUCTURE_LINK);

  const sinks = _.filter(links, link => link.mode() === 'sink');

  const sink = _.find(sinks, link => link.energyFree >= 97);
  if (sink) return this.xfer(sink);

  if (this.energy < 600) return 'waiting';

  const buffer = _.find(links, link => link.mode() === 'buffer');

  if (buffer && buffer.energyFree >= 97) return this.xfer(buffer);

  if (this.energyFree) return 'not full';

  if (buffer && buffer.energyFree) {
    return this.xferAll(buffer);
  }

  const balance = _.max(links, 'energyFree');
  if (balance && balance.energyFree > 4) {
    return this.xferHalf(balance);
  }

  return 'everything is full!';
};

StructureLink.prototype.runBuffer = function() {
  const sink = _.find(
      this.room.findStructs(STRUCTURE_LINK),
      link => link.mode() === 'sink' && !link.energy);
  if (sink) return this.xfer(sink);
  return 'nothing';
};

Room.prototype.runLinks = function() {
  if (!this.memory.links) {
    this.memory.links = {};
    console.log('Creating links for', this.name);
  }

  for (let id in this.memory.links) {
    const link = Game.getObjectById(id);
    if (!link) {
      console.log(
          'Cleared missing link', JSON.stringify(this.memory.links[id]));
      delete this.memory.links[id];
    }
  }
  for (let link of this.findStructs(STRUCTURE_LINK)) {
    let mode = link.mode();
    let act = link.run();
    this.visual.text(act, link.pos.x + 1, link.pos.y);
  }
};
