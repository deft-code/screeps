const shed = require('shed')
require('ai')
require('matrix')
require('Traveler')
require('flag')
require('globals')
require('constants')
require('path')
require('room')
require('room.keeper')
require('source')

require('tombs')
require('struct')
const terminals = require('struct.terminal')
require('struct.tower')
require('struct.link')
require('struct.controller')
require('struct.container')
require('struct.lab')

const market = require('market')

require('team')
require('team.egg')

require('creep')

const lib = require('lib')
const debug = require('debug')
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

const up = Game.time
let ngc = 0

function init () {
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

module.exports.loop = main
function main () {
  const ais = _.map(Game.rooms, 'ai')
  shed.run(ais, 500, 'init')

  const combat = _.filter(ais, ai => ai.isCombat)
  shed.run(combat, 500, 'run')
  shed.run(combat, 1500, 'after')

  const claimed = _.filter(ais, ai => ai.isClaimed && !ai.isCombat)
  shed.run(claimed, 2000, 'run')
  shed.run(claimed, 2000, 'after')

  const remote = _.filter(ais, ai => !ai.isClaimed && !ai.isCombat)
  shed.run(remote, 4000, 'run')
  shed.run(remote, 4000, 'after')

  shed.run([spawn, market, terminals], 5000, 'run')

  shed.run(combat, 6000, 'optional')
  shed.run(claimed, 7000, 'optional')
  shed.run(remote, 8000, 'optional')

  const flags = _.shuffle(_.values(Game.flags))
  shed.run(flags, 9000, 'darkRun')

  if (!flags.length) {
    init()
  }

  const nflags = flags.length
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

  Memory.stats.uptime = Game.time - up
  Memory.stats.ngc = ngc
  Memory.stats.credits = Game.market.credits
  Memory.stats.ticks = Game.time
  Memory.stats.ncreeps = _.size(Game.creeps)
  Memory.stats.mcreeps = _.size(Memory.creeps)
  Memory.stats.nstructs = _.size(Game.structures)
  Memory.stats.nsites = _.size(Game.constructionSites)
  Memory.stats.nspawns = _.size(Game.spawns)
  Memory.stats.nspawning = _.filter(Game.spawns, s => s.spawning).length
  Memory.stats.spawntime = _.sum(Game.spawns, s => (s.spawning && s.spawning.remainingTime) || 0)
  Memory.stats.spawntimetotal = _.sum(Game.spawns, s => (s.spawning && s.spawning.needTime) || 0)
  Memory.stats.cpu = Game.cpu
  Memory.stats.gcl = {
    level: Game.gcl.level,
    progress: Math.floor(Game.gcl.progress),
    progressTotal: Math.floor(Game.gcl.progressTotal)
  }
  Memory.stats.cpu.used = Math.floor(Game.cpu.getUsed())
}
