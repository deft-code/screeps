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
    if (this.storage && this.storage.my && this.storage.isActive()) {
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

    let pct = 0;
    if(this.storage) {
      pct = Math.floor(this.storage.storeTotal/10000);
    }

    if(pct === 100) return 300000000;
    if(pct > 70) return scale * 3000000;
    if(pct > 50) return scale * 1000000;
    if(pct > 20) return scale * 5000000;
    if(pct > 10) return scale * 100000;
    return scale * 10000;
  }

  ratchet(name, yes) {
    let v = this.memory[name];
    if(!_.isFinite(v)){
      v = this.memory[name] = 0;
    }
    if(yes) {
      this.memory[name] = Math.min(CREEP_LIFE_TIME, Math.max(v+1, 10));
    } else if(this.memory[name]) {
      this.memory[name] = Math.max(0, v-1);
    }
  }
}

lib.merge(Room, RoomExtra);

Room.prototype.cycleRamparts = function() {
  if (this.assaulters.length) {
    const ramparts = _.filter(
        this.findStructs(STRUCTURE_RAMPART),
        r => _.any(
            this.lookForAt(r.pos, LOOK_STRUCTURE),
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

  this.ratchet('thostiles', this.hostiles.length);
  this.ratchet('tassaulters', this.assaulters.length);
  this.ratchet('tenemies', this.enemies.length);

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
