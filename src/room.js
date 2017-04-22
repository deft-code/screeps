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
      this.activeByType = _.groupBy(_.filter(this.find(FIND_MY_STRUCTURES), s => s.isActive()), 'structureType');
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
    return this.energyCapacityAvailable - this.energyAvailable);
  }

  get claimable() {
    return room.controller.reservable;
  }

  get wallMax() {
    const scale = this.memory.wallScale || 1;
    const max = scale * (
      room.controller.level * 10000 +
        Math.pow(10, room.controller.level - 1)));

    const memMax = this.memory.wallMax;

    if (memMax) {
      if (memMax <= max) {
        delete this.memory.wallMax;
      } else {
        return memMax;
      }
    }

    return max;
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
    // this.closeRamparts();
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
