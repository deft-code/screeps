require('Traveler');
require('flag');
require('globals');
require('constants');
require('path');
require('room');
require('room.keeper');
require('source');

require('struct');
require('struct.terminal');
require('struct.tower');

require('team');
require('team.egg');

require('creep');

const lib = require('lib');
const debug = require('debug');
const spawn = require('spawn');

mods = [
  'creep.attack',
  'creep.boost',
  'creep.build',
  'creep.carry',
  'creep.dismantle',
  'creep.heal',
  'creep.move',
  'creep.repair',
  'creep.role',
  'creep.work',

  'role.archer',
  'role.block',
  'role.bootstrap',
  'role.bulldozer',
  'role.caboose',
  'role.cart',
  'role.chemist',
  'role.claimer',
  'role.collector',
  'role.coresrc',
  'role.defender',
  'role.drain',
  'role.dropper',
  'role.farmer',
  'role.guard',
  'role.harvester',
  'role.hauler',
  'role.manual',
  'role.medic',
  'role.miner',
  'role.mineral',
  'role.ram',
  'role.reboot',
  'role.reserver',
  'role.scout',
  'role.shunt',
  'role.srcer',
  'role.stomper',
  'role.upgrader',
  'role.wolf',
  'role.worker',
];

for(const mod of mods) {
  lib.merge(Creep, require(mod));
}


let who = Game.time;
let meanBucket = Game.cpu.bucket;
let meanUsed = Game.cpu.limit;

//TODO increase this once throttling is an issue
const kMaxCPU = 300;

function canRun(cpu, bucket) {
  if(cpu > kMaxCPU) return false;
  if(Game.cpu.bucket < bucket - 750) return false; 
  if(cpu > Game.cpu.limit && Game.cpu.bucket < bucket) return false;
  return true;
}

function shuffleRun(objs, bucket, ...funcs) {
  const fs = _.shuffle(funcs);

  let cpu = Game.cpu.getUsed();
  for(const f of fs) {
    for(const obj of objs) {
      const before = cpu;
      if(!canRun(before, bucket)) break;
      try {
        obj[f]();
      } catch (err) {
        if(err.usedCpu > 0) {
          debug.log(obj, f, err.usedCpu);
        } else {
          debug.log(err, err.stack);
          Game.notify(err.stack, 30);
        }
      }
      cpu = Game.cpu.getUsed();
    }
  }
}

module.exports.loop = main;
function main() {
  const rooms = _.shuffle(_.values(Game.rooms));
  shuffleRun(rooms, 500, 'init');
  shuffleRun(rooms, 1500, 'combatTowers');
  shuffleRun(rooms, 2000, 'combatCreeps');
  shuffleRun(rooms, 3000,
    'claimCreeps',
    'combatAfter',
  );
  shuffleRun(rooms, 4000,
    'remoteCreeps',
    'otherAfter',
  );
  if(canRun(Game.cpu.getUsed(), 4000)) {
    spawn.run();
  }
  shuffleRun(rooms, 5000, 'otherTowers');
  shuffleRun(rooms, 9000,
    'runFlags',
    'runKeeper',
  );

  debug.log("Run", Math.floor(Game.cpu.getUsed()), '/', Game.cpu.limit, Game.cpu.bucket, Game.time);
};
