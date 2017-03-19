let modrole = require('mod.role');
let modtower = require('tower');
let modprototypes = require('prototypes');
let modutil = require('util');
let modwork = require('work');
let modmanual = require('role.manual');

Room.prototype.findStructs = function(...types) {
  if(!this.structsByType) {
    this.structsByType =  _.groupBy(this.find(FIND_STRUCTURES), "structureType");
  }
  return _.flatten(_.map(types, sType => this.structsByType[sType] || []));
};

modutil.cachedProp(Room, "enemies", room => room.find(FIND_HOSTILE_CREEPS));
modutil.cachedProp(Room, "hostiles", room => _.filter(room.enemies, e => e.hostile));
modutil.cachedProp(Room, "assaulters", room => _.filter(room.enemies, e => e.assault))

Room.prototype.roleCreeps = function(role) {
  return this.find(FIND_MY_CREEPS, {memory: {role: role}});
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

const custom = {
  W23S79(room) {
    return;
  }
};

Room.prototype.cycleRamparts = function() {
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  if (!hostiles.length) {
  }

  if (hostiles.length) {
    const ramparts = room.findStructs(STRUCTURE_RAMPART);
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
  for(let tower of room.findStructs(STRUCTURE_TOWER)) {
    modtower.tower(tower);
  }

  const customFunc = custom[room.name];
  if (customFunc) {
    customFunc(room);
  }

  if (room.controller && room.controller.my) {
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length) {

      const hurt_structs = _.filter(
        room.findStructs(STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION),
        s => s.hits < s.hitsMax);
      if (hurt_structs.length) {
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
  roomUpkeep(this);
};
