const lib = require('lib');

class RoomExtra {
  findStructs(...types) {
    if (!this.structsByType) {
      this.structsByType =
          _.groupBy(this.find(FIND_STRUCTURES), 'structureType');
    }
    return _.flatten(_.map(types, sType => this.structsByType[sType] || []));
  }

  findActive(...types) {
    if (!this.activeByType) {
      this.activeByType = _.groupBy(
          _.filter(this.find(FIND_MY_STRUCTURES), s => s.isActive()),
          'structureType');
    }
    return _.flatten(_.map(types, sType => this.activeByType[sType] || []));
  }

  get myStorage() {
    if (this.storage && this.storage.my && this.controller.level >= 4) {
      return this.storage;
    }
    return false;
  }

  get myTerminal() {
    if (this.terminal && this.terminal.my && this.terminal.isActive()) {
      return this.terminal;
    }
    return false;
  }

  get myLabs() {
    return this.findActive(STRUCTURE_LAB);
  }

  get myExtns() {
    return this.findActive(STRUCTURE_EXTENSION);
  }

  get energyFreeAvailable() {
    return this.energyCapacityAvailable - this.energyAvailable;
  }

  get claimable() {
    return this.controller.reservable;
  }

  get wallMax() {
    const scale = this.memory.wallScale || 1;
    const min = scale * lib.fibonacci(this.controller.level) * 10000;

    let extra = 0;
    if(this.myStorage && this.storage.store.energy > kEnergyReserve) {
      const cap = this.storage.storeCapacity - kEnergyReserve;
      const e = this.storage.store.energy - kEnergyReserve;
      extra = Math.floor((e/cap) * 10000000);
    }

    return min + extra;
  }

  get turtle() {
    return this.memory.tassaulters || this.memory.turtle > Game.time;
  }

  ratchet(what, up) {
    const twhat = `t${what}`;
    const whattime = `${what}time`;

    if(!this.memory[whattime]) this.memory[whattime] = Game.time;

    if(up) {
      if(!this.memory[twhat]) this.memory[twhat] = 0;
      this.memory[twhat]++;
      this.memory[whattime] = Game.time;
    } else {
      const delta = Game.time - this.memory[whattime];
      if(delta > 10) {
        this.memory[twhat] = 0;
      }
    }
  }
}

lib.merge(Room, RoomExtra);

Room.prototype.cycleRamparts = function() {
  if (this.assaulters.length) {
    const ramparts = _.filter(
        this.findStructs(STRUCTURE_RAMPART),
        r => _.any(
            this.lookForAt(r.pos, LOOK_STRUCTURES),
            s => s.structureType === STRUCTURE_ROAD));
    for (const r of ramparts) {
      let priv = false;
      let pub = true;
      for (const h of this.enemies) {
        priv = priv || h.pos.isNearTo(r);
        pub = pub && !h.pos.inRangeTo(r, 6);
      }
      if (priv) {
        if (r.isPublic) {
          console.log(r.note, 'lock', r.setPublic(false));
        }
      } else if (pub) {
        if (!r.isPublic) {
          console.log(r.note, 'unlock', r.setPublic(true));
        }
      }
    }
  }
};

Room.prototype.closeRamparts = function(mod) {
  if (Game.time % mod !== 0) return;
  if (this.enemies.length) return;

  for (let r of this.findStructs(STRUCTURE_RAMPART)) {
    if (r.isPublic) {
      console.log(r.note, 'lock', r.setPublic(false));
    }
  }
};

const allies = ['tynstar'];

Room.prototype.run = function() {
  this.allies =
      _.filter(this.find(FIND_HOSTILE_CREEPS), c => c.owner.username in allies);
  this.enemies = _.filter(
      this.find(FIND_HOSTILE_CREEPS), c => !(c.owner.username in allies));
  this.hostiles = _.filter(this.enemies, 'hostile');
  this.assaulters = _.filter(this.enemies, 'assault');
  this.melees = _.filter(this.enemies, 'melee');

  this.ratchet('hostiles', this.hostiles.length);
  this.ratchet('assaulters', this.assaulters.length);
  this.ratchet('enemies', this.enemies.length);

  if (this.controller && this.controller.my) {
    if (this.assaulters.length) {
      const structs = this.findStructs(
          STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION);
      if (_.find(structs, s => s.hits < s.hitsMax)) {
        console.log('SAFE MODE!', this.controller.activateSafeMode());
      }
    }

    // this.cycleRamparts();
    this.runTowers();
    this.runLinks();
    this.runLabs();
    // this.closeRamparts(100);
    
    for(let src of this.find(FIND_SOURCES)) {
      for(let spot of src.spots) {
        const [x, y] = [spot.x, spot.y];
        this.visual.circle(x, y, {radius: 0.3, fill: 'yellow'});
        this.visual.text(spot.score, x, y);
      }
      this.visual.circle(src.bestSpot.x, src.bestSpot.y, {radius: 0.2, opacity:0.75, fill: 'black'});
    }
  }
};

const upkeepWalls = function(room) {
  if (room.memory.freezeWalls) {
    return;
  }
  if (!room.memory.wallMin) {
    room.memory.wallMin = 10000;
  }
  if (Game.time % 100 == 0) {
    let walls = room.findStructs(STRUCTURE_WALL);
    if (!walls.length) {
      return false;
    }
    const m = Math.floor(walls.length / 2);
    let s = _.sortBy(walls, 'hits');
    const old = room.memory.wallMin;
    room.memory.wallMin = walls[m].hits;

    console.log(room.name, 'wallMin:', old, '=>', room.memory.wallMin);
  }
};
