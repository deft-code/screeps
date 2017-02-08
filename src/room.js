let modrole = require('mod.role');
let modtower = require('tower');
let modprototypes = require('prototypes');
let modutil = require('util');
let modwork = require('work');
let modroad = require('road');
let modlink = require('link');
let modhauler = require('role.hauler');
let modmanual = require('role.manual');

Room.prototype.findStructs = function(...types) {
  if(!this.structsByType) {
    this.structsByType =  _.groupBy(this.find(FIND_STRUCTURES), "structureType");
  }
  return _.flatten(_.map(types, sType => this.structsByType[sType] || []));
};

modutil.cachedProp(Room, "enemies", room => room.cachedFind(FIND_HOSTILE_CREEPS));
modutil.cachedProp(Room, "hostiles", room => _.filter(room.enemies, e => e.hostile));
modutil.cachedProp(Room, "assaulters", room => _.filter(room.enemies, e => e.assault))

Room.prototype.cachedFind = function(find, filter) {
  this.cache = this.cache || {};
  this.cache[find] = this.cache[find] || {};
  const opts = {
    find: find,
    filter: filter,
  };
  let key = JSON.stringify(opts);
  return this.cache[key] = this.cache[key] || this.find(find, opts);
};

Room.prototype.Structures = function(structureType) {
  let find = FIND_MY_STRUCTURES;
  switch (structureType) {
    case STRUCTURE_ROAD:
    case STRUCTURE_CONTAINER:
    case STRUCTURE_WALL:
      find = FIND_STRUCTURES;
  }
  return this.cachedFind(find, {structureType: structureType});
};

Room.prototype.roleCreeps = function(role) {
  return this.cachedFind(FIND_MY_CREEPS, {memory: {role: role}});
};

modutil.cachedProp(Room, 'sources', function() {
  return this.find(FIND_SOURCES);
});

Object.defineProperty(Room.prototype, 'droppedEnergy', {
  get: function() {
    if (!this._droppedEnergy) {
      this._droppedEnergy = this.find(FIND_DROPPED_ENERGY);
    }
    return this._droppedEnergy;
  },
});

Object.defineProperty(Room.prototype, 'workCreeps', {
  get: function() {
    if (!this._workCreeps) {
      this._workCreeps =
          this.find(FIND_MY_CREEPS, {filter: c => c.memory.role == 'worker'});
    }
    return this._workCreeps;
  },
});

Room.prototype.createRole = function(parts, min, mem) {
  // parts = modutil.optimizeBody(parts);
  let spawn = _.first(this.find(FIND_MY_SPAWNS));
  if (!spawn) {
    // console.log("No spawners");
    return;
  }
};

const custom = {
  W23S79(room) {
    return;
    const energies = room.cachedFind(FIND_DROPPED_ENERGY);
    if (!energies.length) {
      const extns = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType == STRUCTURE_EXTENSION &&
            s.owner.username != 'deft-code'
      });
      const extn = _.sample(extns);
      console.log(extn.note, extn.destroy())
    }
    console.log(room.name);
  }
};

Room.prototype.cycleRamparts = function() {
  const hostiles = room.cachedFind(FIND_HOSTILE_CREEPS);
  if (!hostiles.length) {
  }

  if (hostiles.length) {
    const ramparts = room.Structures(STRUCTURE_RAMPART);
    for (const r of ramparts) {
      let pub = true;
      for (const h of hostiles) {
        if (pub && h.pos.isNearTo(r)) {
          pub = false;
          room.lastLock = r.id;
        }
      }
      const ret = r.setPublic(pub);
      console.log(r.note, 'pub', pub, ret);
    }
  }

};

Room.prototype.cycleRampart = function(rampart) {

};

function upkeepMyRoom(room) {
  modlink.upkeep(room);
  let towers = room.Structures(STRUCTURE_TOWER);
  towers.forEach(modtower.tower);

  modroad.upkeep(room);

  customFunc = custom[room.name];
  if (customFunc) {
    customFunc(room);
  }

  if (room.controller && room.controller.my) {
    const hostiles = room.cachedFind(FIND_HOSTILE_CREEPS);
    if (hostiles.length) {
      const hurt_towers =
          _.filter(room.Structures(STRUCTURE_TOWER), t => t.hits < t.hitsMax);
      const hurt_spawns =
          _.filter(room.Structures(STRUCTURE_SPAWN), s => s.hits < s.hitsMax);
      const hurt_extns = _.filter(
          room.Structures(STRUCTURE_EXTENSION),
          extn => extn.hits < extn.hitsMax);
      if (hurt_towers.length || hurt_spawns.length || hurt_extns.length) {
        console.log('SAFE MODE!', room.controller.activateSafeMode());
      }
    }
  }
};

function roomUpkeep(room) {
  if (room.controller && room.controller.my) {
    upkeepMyRoom(room);
  }
  let cleaned = _.remove(
      room.memory.objects,
      (mem, id) => _.isEmpty(mem) || !Game.getObjectById(id));
  // console.log("Cleaned memory for", JSON.stringify(cleaned));
}

Room.prototype.run = function() {
  this.runLinks();
};

module.exports = {
  upkeep: roomUpkeep,
};
