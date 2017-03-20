require('traveler')({
  exportTraveler: false,
  installTraveler: true,
  installPrototype: true,
  defaultStuckValue: 2,
  reportThreshold: 150
});

const lib = require('lib');
lib.enhanceAll();

require('team');
require('team.base');
require('team.claim');
require('team.farm');
require('team.role');

require('matrix');
require('road');
require('room');
require('source');

require('struct');
require('struct.container');
require('struct.controller');
require('struct.link');
require('struct.spawn');
require('struct.tower');

require('creep');
require('creep.move');
require('creep.role');
require('creep.task');

require('role.archer');
require('role.bulldozer');
require('role.caboose');
require('role.chemist');
require('role.collector');
require('role.dropper');
require('role.farmer');
require('role.guard');
require('role.hauler');
require('role.medic');
require('role.misc');
require('role.scout');
require('role.snipe');
require('role.srcer');
require('role.upgrader');
require('role.worker');

if (false) {
  const profiler = require('screeps-profiler');
  profiler.enable();
  module.exports.loop = profiler.wrap(main);
} else {
  module.exports.loop = main;
}

function runner(objs) {
  for (let name in objs) {
    const obj = objs[name];
    try {
      obj.run();
    } catch (err) {
      console.log(err.stack);
      Game.notify(err.stack, 30);
    }
  }
}

function clearMem(what) {
  for (var name in Memory[what]) {
    if (!Game[what][name]) {
      console.log(`Clear memory for ${what}[${name}]:`, JSON.stringify(Memory[what][name]));
      delete Memory[what][name];
    }
  }
}

function main() {
  PathFinder.use(true);

  runner(Game.rooms);
  runner(Game.flags);
  runner(Game.spawns);
  runner(Game.creeps);

  clearMem('creeps');
  clearMem('flags');
}
