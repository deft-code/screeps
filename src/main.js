import 'memhack';
import { canRun, run } from "shed";
import * as debug from "debug";

import * as cache from "cache";
const xx = Game.time;
console.log(Game.time, ":", Game.time - xx, "injecting, tick and cache");
cache.injectAll();

import 'strat';

import 'roomobj';
import 'role.hub';
import 'role.mason';
import 'role.src';

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
import 'constructionsite';

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
  'creep.dismantle',
  'creep.heal',
  'creep.oldrepair',
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
  if (t.cooldown > 0) {
    debug.log("Terminal busy", t.cooldown)
  } else {
    if (Game.market.credits < 20000000) {
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

let cm = null;
let exits = [];
function doCrazy() {
  const f = Game.flags.WestL;
  if (!f) return;

  if (!cm) {
    if (!cm) cm = new PathFinder.CostMatrix();
  }
  if (!exits.length) {
    exits = f.room.find(FIND_EXIT).map(pos => { return { pos, range: 2 } });
  }
  const ret = PathFinder.search(f.pos, exits, { roomCallback(room) { return cm; } });
  console.log("crazy ops", ret.ops, "cost", ret.cost);
  f.room.visual.poly(ret.path);

  for (let i = 0; i < 2; i++) {
    const p = _.sample(ret.path.slice(5));
    f.room.visual.circle(p, { stroke: 'blue', radius: 1, fill: "" });

    cm.set(p.x, p.y, 0xFE);

  }

  for (let x = 2; x < 48; x++) {
    for (let y = 2; y < 48; y++) {
      if (cm.get(x, y) !== 0) {
        f.room.visual.circle(x, y, { fill: 'red', size: 2 });
      }
    }
  }
  Memory.theMatrix = cm.serialize();

  const ret2 = PathFinder.search(_.sample(exits).pos, { pos: f.pos, range: 5 },{ roomCallback(room) { return cm; } });
  f.room.visual.poly(ret2.path, { stroke: 'red' });
  console.log("incoming load ops", ret2.ops, "cost", ret2.cost);
}

let lastClient = 0;
module.exports.loop = main
function main() {
  // doCrazy();
  if (Memory.client.time !== lastClient) {
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

  drain(null, 'W22N19')

  const rooms = _.values(Game.rooms);
  run(rooms, 500, r => r.strat.init(r));

  // descending order
  rooms.sort((a, b) => b.strat.order(b) - a.strat.order(a));
  const third = Math.floor(rooms.length / 3);
  const hi = rooms.slice(0, third);
  const me = rooms.slice(third, rooms.length - third);
  const lo = rooms.slice(rooms.length - third, rooms.length);

  run(hi, 1000, hi => hi.strat.run(hi));
  run(hi, 2000, hi => hi.strat.after(hi));
  run(me, 2000, me => me.strat.run(me));
  run(me, 2500, me => me.strat.after(me));
  run(lo, 3000, lo => lo.strat.run(lo));
  run(lo, 4000, lo => lo.strat.after(lo));
  run(hi, 5000, hi => hi.strat.optional(hi));
  run(me, 5500, me => me.strat.optional(me));
  run(lo, 6000, lo => lo.strat.optional(lo));

  run(Game.powerCreeps, 2000, pc => pc.run());
  run(Game.powerCreeps, 3000, pc => pc.after());

  if (canRun(Game.cpu.getUsed(), 4000)) {
    spawn.run();
  }

  if (canRun(Game.cpu.getUsed(), 9000)) {
    terminals.run()
  }

  run(Game.flags, 9000, f => f.darkRun());

  if (canRun(Game.cpu.getUsed(), 9000)) {
    powerHack();
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
