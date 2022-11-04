//import 'memhack';
import * as debug from "debug";
import { canRun, run } from "shed";

import * as cache from "cache";
const xx = Game.time;
console.log(Game.time, ":", Game.time - xx, "injecting, tick and cache");
cache.injectAll();

import * as process from "process";
global.spawn = process.spawn;

import 'strat';

import 'ms.globalrespawn';
import 'ms.swipe';
import "service.flag";

import "job.hauler";
import "job.scout";
import "job.srcer";

import 'roomobj';
import 'role.cap';
import 'role.depositfarmer';
import 'role.hub';
import 'role.mason';
import 'role.mineral';
import 'role.shovel';
import 'role.src';
import 'job.startup';

import 'deposit';

import 'Visual';

import 'metastruct';
import 'mission';
import 'matrix';
import 'Traveler';
import 'flag';
//import 'globals';
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
import 'struct.container';
import 'struct.controller';
import 'struct.factory';
import 'struct.lab';
import 'struct.link';
import 'struct.tower';

import * as market from 'market';

import "team";
import 'team.egg';


import 'powercreep';

import 'creep';

import * as lib from 'lib';
import * as spawn from 'spawnold';

import 'role.shunt';
import { getRawMarket } from 'markethack';
import { theRadar } from 'radar';
import { RoomIntel, roomToCoord, roomFromCoord, roomKind, Kind } from 'intel';
import { depositRun } from 'deposit';
import { draw } from 'matrix';
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
  'role.minecart',
  'role.miner',
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

function powerHackRoom(r) {
  const t = r.terminal;
  const s = _.first(r.findStructs(STRUCTURE_POWER_SPAWN));
  if (t.cooldown > 0) {
    r.log("Terminal busy", t.cooldown)
  } else {
    if (t.store.energy < 10000) {
      r.log("low power", t.store.energy);
    } else {
      const maxPrice = (Game.market.credits / 1000000) - 10;
      if (t.store.getFreeCapacity() < 10000) {
        r.log("Too little space", t.store.getFreeCapacity());
      } else {
        if ((t.store.power || 0) > 10000) {
          // debug.log("POWER OVERWHELMING")
        } else {
          r.log("Buy power@", maxPrice, t.buy(RESOURCE_POWER, 1000, maxPrice))
        }
      }

    }
  }

  if (r.storage.store.energy > 10000) {
    s.processPower();
  }

  return [s, t];
}

function powerHack() {
  powerHackRoom(Game.rooms.W21N15);
  const [s, t] = powerHackRoom(Game.rooms.W29N11);

  if (s.power > 0 || t.store.power > 0) {
    Game.spawns.Aycaga.spawnCreep([MOVE, CARRY, CARRY, CARRY], "power");
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

  const ret2 = PathFinder.search(_.sample(exits).pos, { pos: f.pos, range: 5 }, { roomCallback(room) { return cm; } });
  f.room.visual.poly(ret2.path, { stroke: 'red' });
  console.log("incoming load ops", ret2.ops, "cost", ret2.cost);
}


function doMarket() {
  Game.market.orders;
  const start = Game.cpu.getUsed();
  //market.HistoryMean();

  const lookup = getRawMarket();

  const mid = Game.cpu.getUsed();
  const orders = Game.market.getAllOrders({ resourceType: RESOURCE_ENERGY });
  const end = Game.cpu.getUsed();
  debug.log("getMarket", _.size(lookup), "in", mid - start);
  debug.log("getAllOrders", _.size(orders), "in", end - mid);
  //const orders = Game.market.getAllOrders();//RESOURCE_ENERGY);
}


// evil sell order
//const theOrder = "5ec4cd496d8859917f234cd9";
const theOrder = "5ec4de716d8859ff7f27e29c";
function evil() {
  // Disable Evil Market manipulation
  if (Game.time) return false;
  const o = Game.market.orders[theOrder];
  if (!o) return false;
  if (o.remainingAmount > 0) {
    Game.rooms.W29N11.terminal.deal(o.id, Infinity);
    return true;
  }

  if (Game.time < Memory.evil.next) return false;
  const today = _.last(_.sortBy(Game.market.getHistory(RESOURCE_POWER), h => h.date));
  debug.log("today", JSON.stringify(today));
  if (today.avgPrice < 3.5) return false;
  Memory.evil.next = Game.time + _.random(300, 325);
  //Memory.evil.next = Game.time + 15;
  debug.log("extending", Game.market.extendOrder(o.id, Math.min(Game.rooms.W29N11.terminal.store[RESOURCE_POWER], _.random(9000, 9999))));
  return true;
}

function drawStaleness(roomname, range) {
  console.log(roomname, "staleness", RoomIntel.get(roomname).staleness);
  const [ox, oy] = roomToCoord(roomname);
  const v = new RoomVisual(roomname);
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const newname = roomFromCoord(ox + dx, oy + dy);
      const intel = RoomIntel.get(newname);
      let stale = 'x';
      if (intel) stale = intel.staleness;
      if (intel && intel.visibility) stale = 'v'
      const k = roomKind(newname);
      let c = "green";
      switch (k) {
        case Kind.SourceKeeper: c = "red"; break;
        case Kind.Hwy: c = "blue"; break;
      }
      const r = Game.rooms[newname];
      if (r && r.controller?.owner?.username === 'deft-code') c = 'yellow';

      const x = 25 + dx * 2;
      const y = 25 + dy * 2;

      if (_.contains(theRadar.tick.targets, newname)) {
        v.circle(x, y, { radius: 1 });
      }

      v.text(stale, x, y, { stroke: c });
    }
  }
}

function hackAlloy() {
  const t = Game.rooms.W21N15.terminal;
  if (!t || t.store.metal > 1000) return;
  t.room.log("requested metal", t.requestMineral(RESOURCE_METAL, 1000));
}

const reloadT = Game.time;
function genPixels() {
  if(Game.time < reloadT + CREEP_LIFE_TIME) return;
  if(Game.cpu.bucket === 10000) {
    debug.log("Generating Pixel from", Game.cpu.bucket, Game.cpu.generatePixel());
  }
}

process.Service.boot();
console.schedule = process.Service.shedule;


let servert = Game.time;
let lastClient = 0;
module.exports.loop = main
function main() {
  if (Game.shard.name !== 'shard2') {
    console.log("WRONG SHARD", Game.shard);
    return;
  }

  genPixels();

  const rooms = _.values(Game.rooms);
  run(rooms, 500, r => r.strat.init());

  process.runAll();

  return;

  // const history = require('history').history;
  // history.run();
  // debug.log('\n', JSON.stringify(history.memory.players.npc, null, ' '));

  //drawStaleness('W34N20', 10);

  // console.log("server", servert);

  //doMarket();
  // doCrazy();
  if (Memory.client?.time !== lastClient) {
    debug.log(Game.time, "client", JSON.stringify(Memory.client));
    lastClient = Memory.client?.time;
  }

  // descending order
  rooms.sort((a, b) => b.strat.order(b) - a.strat.order(a));
  const third = Math.floor(rooms.length / 3);
  const hi = rooms.slice(0, third);
  const me = rooms.slice(third, rooms.length - third);
  const lo = rooms.slice(rooms.length - third, rooms.length);


  run(hi, 750, hi => hi.strat.run(hi));
  run(hi, 1000, hi => hi.strat.after(hi));
  run(me, 1000, me => me.strat.run(me));
  run(me, 1500, me => me.strat.after(me));
  run(lo, 1500, lo => lo.strat.run(lo));
  run(lo, 2000, lo => lo.strat.after(lo));
  run(hi, 2500, hi => hi.strat.optional(hi));
  run(me, 2750, me => me.strat.optional(me));
  run(lo, 3000, lo => lo.strat.optional(lo));

  run(Game.powerCreeps, 1000, pc => pc.run());
  run(Game.powerCreeps, 1500, pc => pc.after());

  if (canRun(Game.cpu.getUsed(), 2000)) {
    spawn.run();
  }

  if (canRun(Game.cpu.getUsed(), 4500)) {
    terminals.run()
  }

  run(Game.flags, 4500, f => f.darkRun());

  if (canRun(Game.cpu.getUsed(), 4500)) {
    powerHack();
    market.run();
    theRadar.run();
    depositRun();
    hackAlloy();
    market.theMarket.run();
  }

  // theRadar.scan("W24N14");
  //drawStaleness('W24N13', 12);

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