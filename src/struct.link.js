const lib = require('lib');

class Link {
  calcMode() {
    if (this.room.storage && this.pos.inRangeTo(this.room.storage, 2)) {
      return 'buffer';
    }

    const src = _.find(this.room.find(FIND_SOURCES), s => this.pos.inRangeTo(s, 2));
    if(src) {
      return 'src';
    }

    if (this.pos.inRangeTo(this.room.controller, 4)) {
      return 'sink';
    }
    return 'src'
  }

  get mode() {
    let mem = this.room.memory.links[this.id];
    if (!mem) {
      mem = this.room.memory.links[this.id] = {
        note: this.note,
        mode: this.calcMode(),
      };
      console.log('calculating link mode', JSON.stringify(mem));
    }
    return mem.mode;
  }

  xferHalf(target) {
    const e = Math.floor(target.energyFree / 2);
    return this.xferRaw(target, e);
  }

  xfer(target, mod = 33) {
    let e = Math.min(this.energy, Math.ceil(target.energyFree * (1 + LINK_LOSS_RATIO)));
    e -= (e % 100) % mod;
    return this.xferRaw(target, e);
  }

  xferAll(target) {
    return this.xfer(target, 1);
  }

  xferRaw(target, energy) {
    const err = this.transferEnergy(target, energy);
    if (err == OK) {
      //if(this.room.name !== 'sim') {
      //  target.energy += Math.floor(energy * (1 - LINK_LOSS_RATIO));
      //  this.energy -= energy;
      //}
    }
    return `xfer ${energy}: ${err}`;
  }

  run() {
    if (this.cooldown) return `cooldown ${this.cooldown}`;
    if (this.energy < 33) return `empty ${this.energy}`;

    switch (this.mode) {
      case 'sink':
        return this.energy;
      case 'src':
        return this.runSrc();
      case 'buffer':
        return this.runBuffer();
    }
    return `bad mode ${this.mode}`;
  }

  runSrc() {
    const links = this.room.findStructs(STRUCTURE_LINK);

    const sinks = _.filter(links, link => link.mode === 'sink');

    const sink = _.find(sinks, link => link.energyFree >= 32);
    if (sink) return this.xfer(sink);

    const buffer = _.find(links, link => link.mode === 'buffer');

    if (buffer && buffer.energyFree >= 32) return this.xfer(buffer);

    if (this.energyFree) return 'not full';

    if (buffer && buffer.energyFree) {
      return this.xferAll(buffer);
    }

    const balance = _.max(links, 'energyFree');
    if (balance && balance.energyFree > 4) {
      return this.xferHalf(balance);
    }

    return 'everything is full!';
  }

  runBuffer() {
    const sink = _.find(
        this.room.findStructs(STRUCTURE_LINK),
        link => link.mode === 'sink' && !link.energy);
    if (sink) return this.xfer(sink);
    return 'nothing';
  }
}

lib.merge(StructureLink, Link);

Room.prototype.runLinks = function() {
  if (!this.memory.links) {
    this.memory.links = {};
    console.log('Creating links for', this.name);
  }

  for (let id in this.memory.links) {
    const link = Game.getObjectById(id);
    if (!link) {
      console.log('Cleared missing link', JSON.stringify(this.memory.links[id]));
      delete this.memory.links[id];
    }
  }
  for (let link of this.findStructs(STRUCTURE_LINK)) {
    let mode = link.mode;
    let act = link.run();
    this.visual.text(`${mode} ${act}`, link.pos, {align: "left"});
  }
};
