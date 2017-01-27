let modrole = require('mod.role');
let modtower = require('tower');
let modprototypes = require('prototypes');
let modutil = require('util');
let modwork = require('work');
let modroad = require('road');
let modlink = require('link');
//let modpump = require('role.pump');
let modhauler = require('role.hauler');
let modmanual = require('role.manual');

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

Room.prototype.findMyCreeps = function(role) {
  return this.find(FIND_MY_CREEPS, {filter: c => c.memory.role == role});
};

modutil.cachedProp(Room, 'pumpCreeps', function() {
  return this.findMyCreeps('pump');
});

Room.prototype.findStructures = function(kind) {
  return this.find(FIND_STRUCTURES, {filter: {structureType: kind}});
};

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

let spawnUpkeep = function(spawn) {
  let myCreeps = spawn.room.find(FIND_MY_CREEPS);

  let counts = _.countBy(myCreeps, 'memory.role');

  let body = [
    CARRY,
    WORK,
    MOVE,
  ];

  if (!counts.bootstrap) {
    var who = spawn.createRole(body, 3, {role: 'bootstrap'});
    console.log('Bootstrap', who);
  }
  return;
  const nhostiles = spawn.room.cachedFind(FIND_HOSTILE_CREEPS).length;
  if (!counts.ranged && nhostiles) {
    let who = spawn.createRole(
        [
          MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK, MOVE,
          RANGED_ATTACK
        ],
        2, 'ranged');
    console.log('Create Ranged', who);
  }
};

Room.prototype.emergencySafeMode = function() {
  console.log('Deprecated');
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
  /*let needPump = modpump.upkeep(room);
  if(needPump) {
      let newCreep = needPump(room);
      console.log("New pump", newCreep);
  }*/
  let needHauler = modhauler.upkeep(room);
  if (needHauler) {
    let newCreep = needHauler(room);
    console.log('New hauler', newCreep);
  }
  let needWork = modwork.upkeep(room);
  if (needWork) {
    let newCreep = needWork(room);
    console.log('New worker', newCreep);
  }

  let towers = room.Structures(STRUCTURE_TOWER);
  towers.forEach(modtower.tower);

  modroad.upkeep(room);

  customFunc = custom[room.name];
  if (customFunc) {
    customFunc(room);
  }

  let spawns = room.Structures(STRUCTURE_SPAWN);
  spawns.forEach(spawnUpkeep);

  if (!towers.length) {
    const spawn = _.sample(spawns);
    if (spawn && !spawn.spawning) {
      const creeps = room.cachedFind(FIND_MY_CREEPS);
      const counts = _.countBy(creeps, 'memory.role');
      const hurt = _.filter(creeps, c => c.hits < c.hitsMax);
      if (hurt.length && !counts.medic) {
        spawn.newMedic();
      }
    }
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
        console.log('SAFE MOVE!', room.controller.activateSafeMode());
      }
    }
  }


  if (false && room.name == 'W27S79') {
    if (!Game.spawns.Second.spawning &&
        room.energyCapacityAvailable == room.energyAvailable) {
      const counts = _.countBy(Game.creeps, 'memory.role');
      // delete counts["remote build"];
      if (!(counts['remote build'] >= 2)) {
        Game.spawns.Second.roleRemoteBuild();
      }
      if (false && !(counts['remote haul'] >= 1)) {
        Game.spawns.Second.roleRemoteHaul();
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
      (id, mem) => _.isEmpty(mem) || Game.getObjectById(id) == null);
  // console.log("Cleaned memory for", JSON.stringify(cleaned));
}

module.exports = {
  upkeep: roomUpkeep,
};
