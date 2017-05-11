require('traveler')({
  exportTraveler: false,
  installTraveler: true,
  installPrototype: true,
  defaultStuckValue: 2,
  reportThreshold: 150,
});

const lib = require('lib');
lib.enhanceAll();

require('team');
require('team.base');
require('team.farm');
require('team.role');

require('matrix');
require('road');
require('room');
require('source');

require('struct');
require('struct.container');
require('struct.controller');
require('struct.lab');
require('struct.link');
require('struct.spawn');
require('struct.tower');

require('creep');
require('creep.attack');
require('creep.build');
require('creep.carry');
require('creep.dismantle');
require('creep.heal');
require('creep.move');
require('creep.repair');
require('creep.role');
//require('creep.work');

require('role.archer');
require('role.bootstrap');
require('role.bulldozer');
require('role.caboose');
require('role.chemist');
require('role.claimer');
require('role.collector');
require('role.dropper');
require('role.farmer');
require('role.guard');
require('role.hauler');
require('role.medic');
require('role.miner');
require('role.reserver');
require('role.srcer');
require('role.upgrader');
//require('role.worker');

mods = [
  'creep.work',
  'role.worker',
];

for(const mod of mods) {
  lib.merge(Creep, require(mod));
}

if (false) {
  const profiler = require('screeps-profiler');
  profiler.enable();
  module.exports.loop = profiler.wrap(main);
} else {
  module.exports.loop = main;
}

function stack() {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (error, stack_array) => stack_array;
  const obj = {};
  Error.captureStackTrace(obj, arguments.callee);
  const s = obj.stack;
  Error.prepareStackTrace = orig;
  return s;
};
 
eglog = (msg) => {
  const ss = stack();
  const frame = ss[1]
  console.log(`${frame.getFileName()}:${frame.getLineNumber()} ${msg}`);
}

global.debug = (obj, val = true) => obj.memory.debug = val;

global.purgeWalls = (room, dry=true) => {
  let n = 0;
  for(const wall of room.findStructs(STRUCTURE_WALL)) {
    const p = wall.pos;
    if(p.x < 4) continue;
    if(p.y < 4) continue;
    if(p.x > 45) continue;
    if(p.y > 45) continue;

    n++;
    if(dry) {
      room.visual.circle(p, {radius: 0.5, fill: 'red'});
    } else {
      wall.destroy();
    }
  }
  return n;
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
      console.log(
          `Clear memory for ${what}[${name}]:`,
          JSON.stringify(Memory[what][name]));
      delete Memory[what][name];
    }
  }
}

function main() {
  PathFinder.use(true);
  eglog(Game.cpu.bucket);

  runner(Game.rooms);
  runner(Game.flags);
  runner(Game.creeps);

  clearMem('creeps');
  clearMem('flags');
};
