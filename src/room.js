const debug = require('debug');
const lib = require('lib');

class RoomExtras {
  get energyFreeAvailable() {
    return Math.max(0, this.energyCapacityAvailable - this.energyAvailable);
  }
}
lib.merge(Room, RoomExtras);

Room.prototype.runFlags = function() {
  const flags = _.shuffle(this.find(FIND_FLAGS));
  for(const flag of flags) {
    try {
      flag.run();
    } catch(err) {
      debug.log(this, flag, err, err.stack);
    }
  }
};

Room.prototype.findStructs = function(...types) {
  if (!this.structsByType) {
    this.structsByType =
        _.groupBy(this.find(FIND_STRUCTURES), 'structureType');
  }
  return _.flatten(_.map(types, sType => this.structsByType[sType] || []));
};

Room.prototype.lookForAtRange = function(look, pos, range, array) {
  return this.lookForAtArea(
        look, Math.max(0, pos.y - range), Math.max(0, pos.x - range),
        Math.min(49, pos.y + range), Math.min(49, pos.x + range), array);
}

Room.prototype.addSpot = function(name, p) {
  const spots = this.memory.spots = this.memory.spots || {};
  spots[name] = this.packPos(p);
}

Room.prototype.getSpot = function(name) {
  const xy  = (this.memory.spots || {})[name];
  if(!xy) return null;
  return this.unpackPos(xy);
}

const kAllies = [];

function ratchet(room, what, up) {
  const twhat = `t${what}`;
  const whattime = `${what}time`;

  if(!room.memory[whattime]) room.memory[whattime] = Game.time;

  if(up) {
    if(!room.memory[twhat]) room.memory[twhat] = 0;
    room.memory[twhat]++;
    room.memory[whattime] = Game.time;
  } else {
    const delta = Game.time - room.memory[whattime];
    if(delta > 10) {
      room.memory[twhat] = 0;
    }
  }
}

Room.prototype.init = function() {
  const nstructs = this.find(FIND_STRUCTURES).length;
  this.deltaStructs = nstructs !== this.memory.nstructs;
  this.memory.nstructs = nstructs;

  this.allies = [];
  this.enemies = [];
  this.hostiles = [];
  this.assaulters = [];
  this.melees = [];

  for(let c of this.find(FIND_CREEPS)) {
    lib.unlookup(c);
    if(!c.my) {
      if(c.owner.username in kAllies) {
        this.allies.push(c);
      } else {
        this.enemies.push(c);
        if(c.hostile) this.hostiles.push(c);
        if(c.assault) this.assaulters.push(c);
        if(c.melee) this.melees.push(c);
      }
    }
  }

  ratchet(this, 'hostiles', this.hostiles.length);
  ratchet(this, 'assaulters', this.assaulters.length);
  ratchet(this, 'enemies', this.enemies.length);
}

Room.prototype.combatCreeps = function() {
  if(this.enemies.length) {
    this.runCreeps();
  }
}

Room.prototype.claimCreeps = function() {
  if(this.enemies.length < 1 &&
      this.controller && this.controller.my) {
    this.runCreeps();
  }
}

Room.prototype.remoteCreeps = function() {
  if(this.enemies.length < 1 &&
      (!this.controller || !this.controller.my)) {
    this.runCreeps();
  }
}

Room.prototype.runCreeps = function() {
  const creeps = this.find(FIND_MY_CREEPS);
  for(let creep of creeps) {
    try {
      creep.run();
    } catch(err) {
      debug.log(this, creep, err, '\n',  err.stack);
    }
  }
}

Room.prototype.combatAfter = function() {
  if(this.enemies.length) {
    this.runAfter();
  }
}

Room.prototype.otherAfter = function() {
  if(this.enemies.length < 1) {
    this.runAfter();
  }
}

Room.prototype.runAfter = function() {
  const creeps = this.find(FIND_MY_CREEPS);
  for(let creep of creeps) {
    creep.after();
  }
}

Room.prototype.runDefense = function() {
  if (this.controller && this.controller.my) {
    if (this.assaulters.length) {
      const structs = this.findStructs(
          STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION);
      if (_.find(structs, s => s.hits < s.hitsMax)) {
        const ret = this.controller.activateSafeMode();
        debug.log(this, 'SAFE MODE!', ret);
        Game.notify(`SAFE MODE:${ret}! ${this}`, 30);
      }
    }
  }
}
