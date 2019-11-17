import 'memhack';
import { canRun, run } from "shed";
import * as debug from "debug";

import * as cache from "cache";
const xx = Game.time;
console.log(Game.time, ":", Game.time - xx, "injecting, tick and cache");
cache.injectAll();

import 'roomobj';
import 'role.hub';

import 'Visual';

import 'metastruct';
import 'mission';
import 'matrix';
import 'Traveler';
import 'flag';
import 'globals';
import 'console';
import 'constants';
import 'path';
import 'room';
import 'room.keeper';
import 'source';

import 'tombs';
import 'struct';
import * as terminals from 'struct.terminal';
import 'struct.tower';
import 'struct.link';
import 'struct.controller';
import 'struct.container';
import 'struct.lab';

import * as market from 'market';

import "team";
import 'team.egg';


import 'powercreep';

import 'creep';

import * as lib from 'lib';
import * as spawn from 'spawn';

import 'role.shunt';
const mods = [
  'creep.attack',
  'creep.build',
  'creep.dismantle',
  'creep.heal',
  'creep.repair',
  'creep.work',

  'role.archer',
  'role.bootstrap',
  'role.bulldozer',
  'role.caboose',
  'role.cart',
  'role.chemist',
  'role.claimer',
  'role.cleaner',
  'role.collector',
  'role.coresrc',
  'role.ctrl',
  'role.declaimer',
  'role.defender',
  'role.drain',
  'role.dropper',
  'role.farmer',
  'role.guard',
  'role.harvester',
  'role.hauler',
  'role.manual',
  'role.medic',
  'role.mhauler',
  'role.minecart',
  'role.miner',
  'role.mineral',
  'role.paver',
  'role.power',
  'role.ram',
  'role.rambo',
  'role.reboot',
  'role.reserver',
  'role.scout',
  'role.srcer',
  'role.stomper',
  'role.trucker',
  'role.upgrader',
  'role.wolf',
  'role.worker',
  'role.zombiefarmer'
]


for (const mod of mods) {
  // const m = require(mod);
  // if(typeof m !== 'Function') {
  //   debug.log("bad creep module", m);
  //   continue;
  // }
  lib.merge(Creep, require(mod))
}

function drain(t, room) {
  if (!t) return
  if (t.cooldown) return
  const recs = _.shuffle(_.keys(t.store))
  for (const r of recs) {
    if (r === RESOURCE_ENERGY) continue
    if (t.store[r] < 100) continue
    const err = t.send(r, t.store[r], room)
    t.room.log(r, t.store[r], room, err)
    return
  }
}

const up = Game.time
let ngc = 0

function init() {
  if (!Memory.stats) {
    Memory.stats = {}
  }

  if (!Memory.creeps) {
    Memory.creeps = {}
  }

  const s = _.sample(Game.spawns)
  if (!s) return

  const f = Game.flags.Startup
  if (!f) {
    s.pos.createFlag('Startup', COLOR_BLUE, COLOR_RED)
  }
}

function powerHack() {
  const r = Game.rooms.W29N11
  const t = r.terminal
  const s = Game.getObjectById("5c574d80b8cfe8383392fb37")
  if (true || t.cooldown > 0) {
    debug.log("Terminal busy", t.cooldown)
  } else {
    if (Game.market.credits < 10000000) {
      debug.log("Too few credits", Game.market.credits)
    } else {
      if (t.store.getFreeCapacity() < 10000) {
        debug.log("Too little space")
      } else {
        if ((t.store.power || 0) > 10000) {
          // debug.log("POWER OVERWHELMING")
        } else {
          debug.log("Buy power", t.buy(RESOURCE_POWER))
        }
      }
    }
  }

  if (r.storage.store.energy > 10000) {
    s.processPower();
  }
  if (s.power > 0 || t.store.power > 0) {
    Game.spawns.Aycaga.spawnCreep([MOVE, CARRY, CARRY, CARRY], "power")
  }
}

let lastClient = 0;
module.exports.loop = main
function main() {
  if(Memory.client.time !== lastClient) {
    debug.log(Game.time, "client", JSON.stringify(Memory.client));
    lastClient = Memory.client.time;
  }
  const crooms = _.filter(Game.rooms, r => r.controller && r.controller.level > 3 && r.controller.my)
  Game.terminals = _.shuffle(_.compact(_.map(crooms, r => r.terminal)))
  Game.storages = _.shuffle(_.compact(_.map(crooms, r => r.storage)))
  Game.observers = _.shuffle(_.compact(_.map(crooms, r => _.first(r.findStructs(STRUCTURE_OBSERVER)))))

  if (crooms.length === 0) {
    init()
  }
''
  drain(null, 'W22N19')

  run(Game.rooms, 500, r => r.init());

  const remote = _.values(Game.rooms);
  const combat = _.remove(remote, r => r.enemies > 0);
  const claimed = _.remove(remote, r => r.controller && r.controller.my);

  run(combat, 1000, combat => combat.run());
  run(Game.powerCreeps, 2000, pc => pc.run());
  run(combat, 2000, combat => combat.after());
  run(claimed, 2000, claim => claim.run());
  run(claimed, 2500, claim => claim.after());
  run(remote, 3000, remote => remote.run());
  run(remote, 4000, remote => remote.after());
  run(combat, 5000, combat => combat.optional());
  run(claimed, 5500, claim => claim.optional());
  run(remote, 6000, remote => remote.optional());

  if (canRun(Game.cpu.getUsed(), 4000)) {
    spawn.run();
  }

  if (canRun(Game.cpu.getUsed(), 9000)) {
    terminals.run()
  }

  run(Game.flags, 9000, f => f.darkRun());

  if (canRun(Game.cpu.getUsed(), 9000)) {
    market.run()
  }

  const nflags = _.size(Game.flags)
  const mflags = _.size(Memory.flags)
  if (mflags >= nflags) {
    const fnames = _.keys(Memory.flags)
    for (const fname of fnames) {
      if (!Game.flags[fname]) {
        delete Memory.flags[fname]
        debug.log('Cleaned up', fname)
        break
      }
    }
  }

  // debug.log('Run', Math.floor(Game.cpu.getUsed()), '/', Game.cpu.limit, Game.cpu.bucket, Game.time)
  if (typeof Game.cpu.getHeapStatistics === 'function') {
    let heapStats = Game.cpu.getHeapStatistics()
    Memory.stats.heap = heapStats.total_heap_size
    let heapPercent = Math.round((heapStats.total_heap_size / heapStats.heap_size_limit) * 100)
    if (heapPercent > 90) {
      console.log('Garbage Collection!')
      ngc++
      gc()
    }
    // console.log(Game.time - up, 'heap usage:', Math.round((heapStats.total_heap_size) / 1048576), 'MB +', Math.round((heapStats.externally_allocated_size) / 1048576), 'MB of', Math.round(heapStats.heap_size_limit / 1048576), 'MB (', heapPercent, '% )')
  }
}
