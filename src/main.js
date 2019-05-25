import { canRun, run } from "shed";
import * as debug from "debug";

import * as cache from "cache";
cache.injectAll();

import 'roomobj';
import 'role.hub';

require('Visual');

require('metastruct');
require('mission');
require('matrix')
require('Traveler')
require('flag')
require('globals')
require('constants')
require('path')
require('room')
require('room.keeper')
require('source')
require('perma')

require('tombs')
require('struct')
const terminals = require('struct.terminal')
require('struct.tower')
require('struct.link')
require('struct.controller')
require('struct.container')
require('struct.lab')

const market = require('market')

import "team";
require('team.egg')


require("powercreep");

require('creep')

const lib = require('lib')
const spawn = require('spawn')

const mods = [
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
  'role.shunt',
  'role.srcer',
  'role.stomper',
  'role.trucker',
  'role.upgrader',
  'role.wolf',
  'role.worker',
  'role.zombiefarmer'
]

for (const mod of mods) {
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
  if (t.cooldown > 0) {
    debug.log("Terminal busy", t.cooldown)
  } else {
    if (Game.market.credits < 20000000) {
      debug.log("Too few credits", Game.market.credits)
    } else {
      if (t.storeFree < 10000) {
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

module.exports.loop = main
function main() {
  const crooms = _.filter(Game.rooms, r => r.controller && r.controller.level > 3 && r.controller.my)
  Game.terminals = _.shuffle(_.compact(_.map(crooms, r => r.terminal)))
  Game.storages = _.shuffle(_.compact(_.map(crooms, r => r.storage)))
  Game.observers = _.shuffle(_.compact(_.map(crooms, r => _.first(r.findStructs(STRUCTURE_OBSERVER)))))

  if (crooms.length === 0) {
    init()
  }

  drain(null, 'W22N19')

  // const eye = Game.getObjectById('59d2525b7101a04915bb71a5')
  // debug.log(eye, eye.observeRoom('W32N19'))

  // Game.rooms.W29N11.drawSpots()
  // Game.rooms.W24N17.keeper().draw()

  run(Game.rooms, 500, r => r.init());

  const remote = _.values(Game.rooms);
  const combat = _.remove(remote, r => r.enemies > 0);
  const claimed = _.remove(remote, r => r.controller && r.controller.my);

  run(combat, 1000, r => r.run());
  run(Game.powerCreeps, 2000, p => p.run());
  run(combat, 2000, r => r.after());
  run(claimed, 2000, r => r.run());
  run(claimed, 2500, r => r.after());
  run(remote, 3000, r => r.run());
  run(remote, 4000, r => r.after());
  run(combat, 5000, r => r.optional());
  run(claimed, 5500, r => r.optional());
  run(remote, 6000, r => r.optional());

  if (canRun(Game.cpu.getUsed(), 4000)) {
    spawn.run();
  }

  if (canRun(Game.cpu.getUsed(), 9000)) {
    terminals.run()
    powerHack()
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
