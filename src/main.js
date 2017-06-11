
const stack = require('stack');
const profiler = require('profiler');
profiler.injectAll();

require('traveler');

const lib = require('lib');
lib.enhanceAll();
require('constants');

require('team');
require('team.base');
require('team.block');
require('team.farm');
require('team.misc');
require('team.occupy');
require('team.role');

require('matrix');
require('road');
require('room');
const roomplan = require('room.plan');
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
require('creep.dismantle');
require('creep.move');
require('creep.repair');
require('creep.role');

require('role.archer');
require('role.chemist');
require('role.claimer');
require('role.collector');
require('role.dropper');
require('role.farmer');
require('role.miner');
require('role.reserver');
require('role.srcer');

mods = [
  'creep.boost',
  'creep.carry',
  'creep.heal',
  'creep.work',

  'role.block',
  'role.bootstrap',
  'role.bulldozer',
  'role.caboose',
  'role.cart',
  'role.defender',
  'role.drain',
  'role.guard',
  'role.hauler',
  'role.manual',
  'role.medic',
  'role.miner',
  'role.mineral',
  'role.ram',
  'role.scout',
  'role.stomper',
  'role.upgrader',
  'role.wolf',
  'role.worker',
];

for(const mod of mods) {
  lib.merge(Creep, require(mod));
}

module.exports.loop = main;

eglog = (msg) => {
  const ss = stack.get();
  const frame = ss[1]
  console.log(`${frame.getFileName()}.js#${frame.getLineNumber()} ${msg}`);
}

global.busyCreeps = (n) => {
  const x = _.sortBy(Game.creeps, c => c.memory.cpu / (Game.time - c.memory.birth)).reverse();
  for(let i=0; i<n; i++) {
    const c = x[i];
    console.log(c, c.memory.role, c.memory.team, c.memory.cpu, Game.time-c.memory.birth);
  }
}

global.debug = (obj, val = true) => obj.memory.debug = val;
global.nodebug = (obj) => debug(obj, false);

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
    profiler.sample()
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
  profiler.main(30);
  PathFinder.use(true);
  eglog(`${Game.cpu.getUsed()} ${Game.cpu.bucket}`);

  runner(Game.rooms);
  runner(Game.flags);
  runner(Game.creeps);

  roomplan();
  profiler.sample();

  clearMem('creeps');
  clearMem('flags');
  profiler.sample();
};
