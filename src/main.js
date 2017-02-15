require('traveler')({exportTraveler: false, installTraveler: true, installPrototype: true, defaultStuckValue: 2, reportThreshold: 100});

const lib = require('lib');
lib.enhanceAll();

const modutil = require('util');
const server = require('server');

require('team');
require('team.base');
require('team.claim');
require('team.farm');
require('team.role');


require('prototypes');

require('container');
require('controller');
require('link');
require('matrix');
require('road');
require('room');
require('source');
require('spawn');
require('tower');

require('creep');
require('creep.move');
require('role.hauler');

require('mod.role');
require('squad.attack');
require('squad.snipe');
require('work');

require('role.bulldozer');
require('role.chemist');
require('role.guard');
require('role.medic');
require('role.misc');
require('role.scout');
require('role.srcer');

global.structMem = function(id) {
  const s = Game.getObjectById(id);
  return s.note + JSON.stringify(s.memory);
};

global.dismantle = (id) => Game.getObjectById(id).dismantle();

global.opposite = lib.oppositeDir;

if(false) {
    const profiler = require('screeps-profiler');
    profiler.enable();
    module.exports.loop = profiler.wrap(main);
} else {
    module.exports.loop = main;
}

function runner(objs) {
  for(let name in objs) {
    obj = objs[name];
    try {
      obj.run();
    }
    catch( err ) {
      console.log(err.stack);
      Game.notify(err.stack, 30);
    }
  }
}

function main() {
    PathFinder.use(true);
    runner(Game.rooms);
    runner(Game.flags);
    runner(Game.spawns);
    runner(Game.creeps);

    for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
           delete Memory.creeps[name];
          console.log('Clearing non-existing creep memory:', name);
        }
    }
    //console.log(server.run(), server.ticks, server.uptime);
}
