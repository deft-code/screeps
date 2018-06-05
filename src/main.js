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

// TODO increase this once throttling is an issue
const kMaxCPU = 300

function canRun (cpu, bucket) {
  if (cpu > kMaxCPU) {
    debug.warn('CPU Throttled')
    return false
  }
  if (Game.cpu.bucket < bucket - 750) return false
  if (cpu > Game.cpu.limit && Game.cpu.bucket < bucket) return false
  return true
}

function shuffleRun (objs, bucket, ...funcs) {
  if (!canRun(Game.cpu.getUsed(), bucket)) return

  let runs = []
  for (const f of funcs) {
    runs.push(..._.map(objs, obj => [obj, f]))
  }
  runs = _.shuffle(runs)
  for (const [obj, f] of runs) {
    if (!canRun(Game.cpu.getUsed(), bucket)) break
    try {
      obj[f]()
    } catch (err) {
      if (err.usedCpu > 0) {
        debug.log(obj, f, err.usedCpu)
      } else {
        debug.log(obj, f, err, err.stack)
        Game.notify(err.stack, 30)
      }
    }
  }
}

function drain (t, room) {
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

// Game.rooms.W29N11.addSpot('aux', 4326)
// Game.rooms.W29N11.addSpot('auxsrc', 1514)
// Game.rooms.W29N11.addSpot('core', 4539)
// Game.rooms.W29N11.addSpot('coresrc', 2445)
// Game.rooms.W29N11.addSpot('mineral', 2225)

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

// Game.rooms.E13S19.addSpot('aux', Game.rooms.E13S19.getPositionAt(43, 30))
module.exports.loop = main
function main () {
  // Game.rooms.E13S19.addSpot('core', Game.rooms.E13S19.getPositionAt(34, 29))
  // Game.rooms.E13S19.addSpot('auxsrc', Game.rooms.E13S19.getPositionAt(6, 43))
  // Game.rooms.E13S19.addSpot('mineral', Game.rooms.E13S19.getPositionAt(32, 11))

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

  const rooms = _.shuffle(_.values(Game.rooms))
  const flags = _.shuffle(_.values(Game.flags))
  shuffleRun(rooms, 500, 'init')
  shuffleRun(rooms, 1500, 'combatTowers')
  shuffleRun(rooms, 2000, 'combatCreeps')
  shuffleRun(rooms, 3000,
    'claimCreeps',
    'combatAfter'
  )
  shuffleRun(rooms, 4000,
    'remoteCreeps')
  shuffleRun(rooms, 4000,
    'otherAfter')
  if (canRun(Game.cpu.getUsed(), 4000)) {
    spawn.run()
  }
  shuffleRun(rooms, 5000,
    'otherTowers',
    'stats'
  )
  if (canRun(Game.cpu.getUsed(), 9000)) {
    terminals.run()
  }
  shuffleRun(flags, 9000, 'darkRun')
  shuffleRun(rooms, 9000,
    'runFlags',
    'runKeeper',
    'runLabs',
    'runLinks',
    'spawningRun'
  )
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

  // debug.log(Math.floor(Game.cpu.getUsed() * 1000))

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
