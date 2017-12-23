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
require('struct.link');

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
  'role.ctrl',
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
          debug.log(obj, err, err.stack);
          Game.notify(err.stack, 30);
        }
      }
      cpu = Game.cpu.getUsed();
    }
  }
}

Room.prototype.patch = function() {
  if(!this.controller || !this.controller.my) return;
  if(this.find(FIND_SOURCES).length < 2) return;

  const core = this.getSpot('core');
  if(!core) {
    const fname = `Patch${this.name}`;
    let f = Game.flags[fname];
    if(!f) {
      this.createFlag(25, 25, fname, COLOR_ORANGE, COLOR_BLUE);
      return;
    }
    debug.log(this, f);
  }

  const names = _.keys(this.memory.spots);
  let y = this.controller.pos.y + 2;
  const x = this.controller.pos.x;
  for(let name of names) {
    const p = this.getSpot(name);
    this.visual.text(name, x, y);
    this.visual.line(x, y, p.x, p.y);
    y++;
  }
}

function patch() {
  Game.rooms.W22N19.addSpot('ctrl', Game.rooms.W22N19.getPositionAt(37,13));

  Game.rooms.W23N19.addSpot('auxsrc', Game.rooms.W23N19.getPositionAt(15,44));
  Game.rooms.W23N19.addSpot('core', Game.rooms.W23N19.getPositionAt(18,21));
  Game.rooms.W23N19.addSpot('coresrc', Game.rooms.W23N19.getPositionAt(17,19));
  Game.rooms.W23N19.addSpot('ctrl', Game.rooms.W23N19.getPositionAt(33,5));

  Game.rooms.W23N22.addSpot('aux', Game.rooms.W23N22.getPositionAt(28,42));
  Game.rooms.W23N22.addSpot('core', Game.rooms.W23N22.getPositionAt(27,8));
  Game.rooms.W23N22.addSpot('ctrl', Game.rooms.W23N22.getPositionAt(28,10));

  Game.rooms.W24N17.addSpot('aux', Game.rooms.W24N17.getPositionAt(11,25));
  Game.rooms.W24N17.addSpot('auxsrc', Game.rooms.W24N17.getPositionAt(9,25));
  Game.rooms.W24N17.addSpot('core', Game.rooms.W24N17.getPositionAt(18,26));
  Game.rooms.W24N17.addSpot('coresrc', Game.rooms.W24N17.getPositionAt(20,26));
  Game.rooms.W24N17.addSpot('ctrl', Game.rooms.W24N17.getPositionAt(32,28));

  Game.rooms.W25N23.addSpot('aux', Game.rooms.W25N23.getPositionAt(24,36));
  Game.rooms.W25N23.addSpot('auxsrc', Game.rooms.W25N23.getPositionAt(26,35));
  Game.rooms.W25N23.addSpot('core', Game.rooms.W25N23.getPositionAt(24,43));
  Game.rooms.W25N23.addSpot('coresrc', Game.rooms.W25N23.getPositionAt(26,42));
  Game.rooms.W25N23.addSpot('ctrl', Game.rooms.W25N23.getPositionAt(26,32));

  Game.rooms.W27N22.addSpot('auxsrc', Game.rooms.W27N22.getPositionAt(16,4));
  Game.rooms.W27N22.addSpot('ctrl', Game.rooms.W27N22.getPositionAt(25,36));
}

module.exports.loop = main;
function main() {
  patch();

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
    'patch',
    'runFlags',
    'runKeeper',
    'runLinks',
  );

  //debug.log("Run", Math.floor(Game.cpu.getUsed()), '/', Game.cpu.limit, Game.cpu.bucket, Game.time);
};
