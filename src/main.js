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
  'role.reboot',
  'role.reserver',
  'role.scout',
  'role.shunt',
  'role.srcer',
  'role.stomper',
  'role.trucker',
  'role.upgrader',
  'role.wolf',
  'role.worker'
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

module.exports.loop = main
function main () {
  const crooms = _.filter(Game.rooms, r => r.controller && r.controller.level > 3 && r.controller.my)
  Game.terminals = _.shuffle(_.compact(_.map(crooms, r => r.terminal)))
  Game.storages = _.shuffle(_.compact(_.map(crooms, r => r.storage)))

  drain(null, 'W22N19')

  // const eye = lib.lookup('59d2525b7101a04915bb71a5')
  // debug.log(eye, eye.observeRoom('W32N19'))

  // Game.rooms.W24N17.drawSpots()
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
    // 'runTerminal',
    'spawningRun'
  )
  if (canRun(Game.cpu.getUsed(), 9000)) {
    market.run()
  }
  // debug.log('Run', Math.floor(Game.cpu.getUsed()), '/', Game.cpu.limit, Game.cpu.bucket, Game.time)

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
