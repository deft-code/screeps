// Entry point. Import order matters: every module below extends the game
// prototypes or registers a mission/job/daemon as it loads, and later
// merges win on a name collision (docs/runtime-tick.md).
//
// Until Nov 2026 this was main.js and carried the 2017-2020 tick loop
// (flag teams, power/market hacks, heap stats) after an unconditional
// `return` in loop(); that dead code is gone (docs/legacy-systems.md keeps
// what it did).

//import 'memhack';
import * as debug from "debug";
import { run } from "shed";
import { tick as paceTick } from "pace";

import * as cache from "cache";
const xx = Game.time;
// Build stamp: bump by hand on a push to tell which code the shard runs.
global.BUILD_STAMP = "2026-11-05a";
console.log(Game.time, ":", Game.time - xx, "injecting, tick and cache, build", global.BUILD_STAMP);
cache.injectAll();

import * as process from "process";

// temp
global.r = Game.getObjectById('6a901a3bb8684d0008337ef3' as Id<any>);


// Schedule a service to run that persists across global resets.
global.scheduleService = (cmd: string) => process.Service.schedule(cmd);

// Run a service until the next global reset only (not scheduled). Was
// documented but missing until Oct 2026.
global.spawnService = (cmd: string) => process.Service.spawn(cmd);

// Live service instance for a command string, or null. e.g. getService('Swipe W5N8 W6N8').windDown()
global.getService = (cmd: string) => process.Service.getType(cmd);

// Print every live process (daemons, room strats, services) with its status().
global.lsProcess = () => {
  const procs = process.Process.all();
  for (const proc of procs) {
    console.log(proc.toString());
  }
  return `${procs.length} processes`;
};

// Log any scheduled command that has no live instance (its class failed to
// spawn at boot), then return the live services.
const liveServices = () => {
  const live = process.Service.all();
  const liveNames = live.map(svc => svc.name);
  for (const cmd of Memory.scheduler.services) {
    if (!liveNames.includes(cmd)) console.log(cmd, '[scheduled NOT LIVE]');
  }
  return live;
};

// Names (command strings) of every live service; pass one to getService() to
// reach the instance: getService(lsService()[0]).windDown().
global.lsService = () => liveServices().map(svc => svc.name);

// `name [status()]` of every live service, as a list.
global.statusServices = () => liveServices().map(svc => svc.toString());

// Spawn telemetry table (spawnload.ts): load short/long and creeps per 1500
// ticks short/long, for everything, each room and each spawn.
global.spawnLoads = () => require('spawnload').report();
global.createFlagAt = (...args: any[]) => require('flag').createFlagAt(...args);

// Market console (docs/market-design.md): the price tracker table, the stock
// rules, the manipulation suspects and blacklist, the dry-run trader's ledgers.
global.market = (res?: string) => require('market').table(res);
global.stockRule = (res: string, patch?: any) => require('stockrules').stockRule(res, patch);
global.stockRules = (format?: string) => require('stockrules').stockRules(format);
global.blacklist = (player?: string, res?: string | null, days?: number) => require('marketwatch').blacklist(player, res, days);
global.suspects = () => require('marketwatch').listSuspects();
global.traderReport = (scn?: string, fills?: number) => require('ms.trader').report(scn, fills);
global.traderWatch = () => require('ms.trader').watchReport();

import 'reactor';  // defines the season-only globals as undefined off-season; must load first
import 'strat';

import 'ms.globalrespawn';
import 'ms.swipe';
import 'ms.bulldoze';
import 'ms.raze';
import 'ms.skfarm';
import 'ms.nidoran';
import 'ms.farm';
import 'ms.reactor';
import 'ms.thormine';
import 'ms.reactordepot';
import 'ms.remote';
import 'ms.growfarm';
import 'ms.once';
import 'ms.always';
import 'ms.paveall';
import 'ms.startup';
import 'ms.hub';
import 'ms.thorhub';
import 'ms.selloff';
import 'ms.trader';
import 'ms.experiment';
import 'ms.balance';
import 'ms.furiosa';
import 'ms.xfer';
import 'ms.xferstartup';
import 'ms.capture';
import 'ms.loot';
import 'ms.stealreactor';
import 'ms.thorsurvey';
import 'ms.assault';
import 'ms.assaulttwo';
import 'ms.assaultthree';
import 'ms.invadercore';
import 'ms.invadercorethree';
import 'ms.coreminer';
import 'labplan';
import "service.flag";

import "job.hauler";
import "job.scout";
import "job.crow";
import "job.wicktwo";
import "job.wickthree";
import "job.ballerina";
import "job.coredrillthree";
import "job.corecleaner";
import "job.coresweeper";
import "job.paver";
import "job.toxic";
import "job.razer";
import "job.canopener";
import "job.looter";
import "job.usurper";
import "job.chaos";
import "job.skhunter";
import "job.skvulture";
import "job.skharvester";
import "job.sktrucker";
import "job.prospector";
import "job.hubminer";
import "job.hubminecart";
import "job.harvester";
import "job.trucker";
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
import 'job.pioneer';
import 'job.claimer';

import 'deposit';

import 'Visual';

import 'metastruct';
import 'mission';
import 'matrix';
import 'flag';
import 'console';
import 'constants';
import 'path';
import 'room';
import 'room.keeper';
import 'source';
import 'constructionsite';

import 'tombs';
import 'struct';
import 'struct.terminal';
import 'struct.container';
import 'struct.controller';
import 'struct.factory';
import 'struct.observer';
import 'struct.lab';
import 'struct.link';
import 'struct.tower';

import 'market';

import "team";
import 'team.egg';


import 'powercreep';
import 'enemy';

import 'creep';

import 'lib';
import 'spawnold';

import 'role.shunt';
import 'markethack';  // installs the raw order table getter at import
import { theRadar } from 'radar';
import 'intel';
import 'marketwatch';  // market manipulation detector daemon; after market and intel

// The legacy creep mixins (@injecter(Creep) classes; until Nov 2026 plain
// JS classes merged here by lib.merge). Imported after the TS roles above
// so that, as before, these win on a collision (afterWorker: role.worker
// over role.mason, docs/known-issues.md).
import 'creep.attack';
import 'creep.dismantle';
import 'creep.heal';
import 'creep.oldrepair';
import 'creep.work';

import 'role.archer';
import 'role.bootstrap';
import 'role.bulldozer';
import 'role.caboose';
import 'role.cart';
import 'role.chemist';
import 'role.claimer';
import 'role.cleaner';
import 'role.collector';
import 'role.coresrc';
import 'role.declaimer';
import 'role.defender';
import 'role.drain';
import 'role.dropper';
import 'role.farmer';
import 'role.guard';
import 'role.harvester';
import 'role.hauler';
import 'role.manual';
import 'role.medic';
import 'role.minecart';
import 'role.miner';
import 'role.paver';
import 'role.power';
import 'role.ram';
import 'role.rambo';
import 'role.reboot';
import 'role.reserver';
import 'role.scout';
import 'role.srcer';
import 'role.stomper';
import 'role.trucker';
import 'role.upgrader';
import 'role.wolf';
import 'role.worker';
import 'role.zombiefarmer';

const reloadT = Game.time;
function genPixels() {
  if(Game.time < reloadT + CREEP_LIFE_TIME) return;
  if(Game.cpu.bucket === 10000) {
    debug.log("Generating Pixel from", Game.cpu.bucket, Game.cpu.generatePixel());
  }
}

process.Service.boot();

export const loop = main
function main() {
  if (Game.shard.name !== 'shard2' && Game.shard.name !== 'shardSeason') {
    console.log("WRONG SHARD", Game.shard);
    return;
  }
  // Tick-rate sampler behind pace.humanize (mineral regen labels).
  paceTick();

  if (Game.shard.name === 'shard2') {
    genPixels();
  }

  const rooms = _.values<Room>(Game.rooms);
  run(rooms, 500, r => r.strat.init());

  process.runAll();

  // Observers: serve the tick's observe requests (Capture's neighbours,
  // deposit scouting), idle ones scan for stale rooms.
  theRadar.run();
}
