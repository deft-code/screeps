const lib = require('lib');
const debug = require('debug');
const matrix = require('matrix');

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

  drawUI() {
    for(const src of this.find(FIND_SOURCES)) {
      this.visual.circle(src.bestSpot, {fill:"yellow"});
    }
    for(const min of this.find(FIND_MINERALS)) {
      this.visual.circle(min.bestSpot, {fill:"yellow"});
    }
    if(this.controller && this.controller.my) {
      for(const lab of this.findStructs(STRUCTURE_LAB)) {
        if(lab.planType !== lab.mineralType && lab.mineralType) {
          this.visual.text(`${lab.planType}:${lab.mineralType}`, lab.pos, {color:'0xAAAAAA', font:0.3});
        } else {
          this.visual.text(lab.planType, lab.pos, {color:'0xAAAAAA', font:0.4});
        }
      }
      for(const link of this.findStructs(STRUCTURE_LINK)) {
        let sym = '=';
        if(link.mode === 'sink') {
          sym = '-';
        } else if(link.mode === 'src') {
          sym = '+';
        }
        this.visual.text(sym, link.pos);
      }
    }
    if(lib.isSK(this)) {
      matrix.draw(this.name);
    }
  }

  init() {
    if(!this.memory.prof) {
      this.memory.prof = {
        cpu: 0,
        cpu95: 0,
        cpu99: 0,
      };
    }
    const cpu = this.memory.prof.cpu;
    this.memory.prof.cpu = 0;
    this.memory.prof.cpu95 = Math.round((this.memory.prof.cpu95 * 19 + cpu)/20);
    this.memory.prof.cpu99 = Math.round((this.memory.prof.cpu99 * 99 + cpu)/100);

    if(!Game._ids) Game._ids = {};
    this.allies = [];
    this.enemies = [];
    this.hostiles = [];
    this.assaulters = [];
    this.melees = [];

    for(let c of this.find(FIND_CREEPS)) {
      Game._ids[c.id] = c;
      if(!c.my) {
        if(c.owner.username in allies) {
          this.allies.push(c);
        } else {
          this.enemies.push(c);
          if(c.hostile) this.hostiles.push(c);
          if(c.assault) this.assaulters.push(c);
          if(c.melee) this.melees.push(c);
        }
      }
    }

    this.ratchet('hostiles', this.hostiles.length);
    this.ratchet('assaulters', this.assaulters.length);
    this.ratchet('enemies', this.enemies.length);

    if (this.controller && this.controller.my) {
      if (this.assaulters.length) {
        const structs = this.findStructs(
            STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION);
        if (_.find(structs, s => s.hits < s.hitsMax)) {
          const ret = this.controller.activateSafeMode();
          console.log(this, 'SAFE MODE!', ret);
          Game.notify(`SAFE MODE:${ret}! ${this}`, 30);
        }
      }

      this.runTowers();
      this.runLinks();
    }
  }

  run() {
    if (this.controller && this.controller.my) {
      this.runLabs();
      if(this.myTerminal) this.terminal.run();
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

const allies = [];

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
