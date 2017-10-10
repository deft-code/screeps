
const profiler = require('profiler');
profiler.injectAll();

const stack = require('stack');

require('Traveler');

const lib = require('lib');
lib.enhanceAll();
require('constants');
const matrix = require('matrix');

const debug = require('debug');

require('team');
require('team.base');
require('team.block');
require('team.farm');
require('team.misc');
require('team.occupy');
require('team.role'); require('team.remote'); 
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
require('struct.terminal');
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
  'role.harvester',
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

global.busyCreeps = (n) => {
  const x = _.sortBy(Game.creeps, c => c.memory.cpu / (Game.time - c.memory.birth)).reverse();
  for(let i=0; i<n; i++) {
    const c = x[i];
    console.log(c, c.memory.role, c.memory.team, c.memory.cpu, Game.time-c.memory.birth);
  }
}


global.purgeWalls = (room, dry=true) => {
  let n = 0;
  const delta = 5;
  for(const wall of room.findStructs(STRUCTURE_WALL)) {
    const p = wall.pos;
    if(p.x < delta) continue;
    if(p.y < delta) continue;
    if(p.x > 49-delta) continue;
    if(p.y > 49-delta) continue;

    n++;
    if(dry) {
      room.visual.circle(p, {radius: 0.5, fill: 'red'});
    } else {
      wall.destroy();
    }
  }
  return n;
}


global.worldWipe = (keep) => {
  const flags = _.keys(Game.flags);
  for(const fname of flags) {
    const f = Game.flags[fname];
    if(f.pos.roomName !== keep) {
      if(f.room) {
        global.wipe(f.room);
      } else {
        f.remove();
      }
    }
  }
}

global.wipe = (room) => {
  const creeps = room.find(FIND_MY_CREEPS);
  for(const c of creeps) {
    c.suicide();
  }

  const flags = room.find(FIND_FLAGS);
  for(const f of flags) {
    f.remove();
  }

  const structs = room.find(FIND_STRUCTURES);
  for(const s of structs) {
    s.destroy();
  }
};

function runner(objs) {
  let num = 0;
  let maxName = 'first';
  let maxCpu = 0;

  let prevName = 'first';
  let prevCpu = Game.cpu.getUsed();
  for (let name in objs) {
    const obj = objs[name];
    try {
      obj.run();
    } catch (err) {
      debug.log(err.stack);
      if(err.usedCpu > 0) {
        debug.log(`Previous: ${prevName}: ${prevCpu}, ${err.usedCpu}`);
        return;
      }
      Game.notify(err.stack, 30);
    }
    const currCpu = Game.cpu.getUsed();
    const cpu = currCpu - prevCpu
    if(cpu > 50) {
      debug.log(obj, "too much cpu", cpu);
    }
    if(cpu > maxCpu) {
      maxName = name;
      maxCpu = cpu;
    }
    prevName = name;
    prevCpu = currCpu;
    num++;
  }

  //debug.log("avg cpu:", prevCpu / num);
  //debug.log("max cpu:", maxName, maxCpu);
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


let who = Game.time;
let meanBucket = Game.cpu.bucket;
let meanUsed = Game.cpu.limit;

const kMaxCPU = 450;
const roomApply = (bucket, ...funcs) => {
  const maxCpu = Math.min(kMaxCPU,
    // Worst case: tends towards bucket === limit
    (Game.cpu.limit + Game.cpu.bucket)/2);

  const rooms = _.shuffle(_.values(Game.rooms));
  const fs = _.shuffle(funcs);

  let cpu = Game.cpu.getUsed();
  for(const f of fs) {
    for(const room of rooms) {
      const before = cpu;
      if(before > maxCpu) break;
      if(Game.cpu.bucket < bucket - 750) break; 
      if(before > Game.cpu.limit && Game.cpu.bucket < bucket) break;
      try {
        if(_.isFunction(f)) {
          f(room);
        } else {
          room[f]();
        }
      } catch (err) {
        debug.log(err.stack);
        if(err.usedCpu > 0) {
          debug.log(room, f, err.usedCpu);
        }
        Game.notify(err.stack, 30);
      }
      cpu = Game.cpu.getUsed();
      room.memory.prof.cpu += Math.round(1000 * cpu - 1000 * before);
    }
  }
};

function main() {
  //profiler.main();//27);
  
  roomApply(500, 'init');

  runner(_.sample(Game.creeps, 150));
  runner(Game.flags);

  roomApply(7000, 'run');

  roomApply(8000, 'drawPlans','drawUI', 'runFlags');

  roomApply(9000, 'runPlan');
  roomApply(10000, 'growRoads');

  const used = Game.cpu.getUsed();
  meanUsed = meanUsed * 0.95 + used * 0.05;
  meanBucket = meanBucket * 0.95 + Game.cpu.bucket * 0.05;

  debug.log(`${who%10}:${Game.time-who} ${Math.round(used)}:${Math.round(meanUsed)}, ${Game.cpu.bucket}:${Math.round(meanBucket)}`);

  //_.forEach(Game.rooms, r => matrix.draw(r.name));
  
  profiler.sample();

  clearMem('creeps');
  clearMem('flags');
  profiler.sample();
};
