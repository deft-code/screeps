require('Traveler')
require('flag')
require('globals')
require('constants')
require('path')
require('room')
require('room.keeper')
require('source')

require('struct')
const terminals = require('struct.terminal')
require('struct.tower')
require('struct.link')

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
  'role.mhauler',
  'role.minecart',
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
  'role.worker'
]

for (const mod of mods) {
  lib.merge(Creep, require(mod))
}

// TODO increase this once throttling is an issue
const kMaxCPU = 300

function canRun (cpu, bucket) {
  if (cpu > kMaxCPU) return false
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

function patch () {
  Game.rooms.W22N19.addSpot('aux', Game.rooms.W22N19.getPositionAt(41, 13))
  Game.rooms.W22N19.addSpot('auxsrc', Game.rooms.W22N19.getPositionAt(32, 40))
  Game.rooms.W22N19.addSpot('core', Game.rooms.W22N19.getPositionAt(30, 40))
  Game.rooms.W22N19.addSpot('coresrc', Game.rooms.W22N19.getPositionAt(29, 5))
  Game.rooms.W22N19.addSpot('ctrl', Game.rooms.W22N19.getPositionAt(37, 13))
  Game.rooms.W22N19.addSpot('mineral', Game.rooms.W22N19.getPositionAt(37, 22))

  Game.rooms.W23N19.addSpot('aux', Game.rooms.W23N19.getPositionAt(13, 20))
  Game.rooms.W23N19.addSpot('auxsrc', Game.rooms.W23N19.getPositionAt(15, 19))
  Game.rooms.W23N19.addSpot('core', Game.rooms.W23N19.getPositionAt(14, 42))
  Game.rooms.W23N19.addSpot('coresrc', Game.rooms.W23N19.getPositionAt(15, 44))
  Game.rooms.W23N19.addSpot('ctrl', Game.rooms.W23N19.getPositionAt(33, 5))
  Game.rooms.W23N19.addSpot('mineral', Game.rooms.W23N19.getPositionAt(4, 14))

  Game.rooms.W23N22.addSpot('aux', Game.rooms.W23N22.getPositionAt(27, 8))
  Game.rooms.W23N22.addSpot('auxsrc', Game.rooms.W23N22.getPositionAt(28, 6))
  Game.rooms.W23N22.addSpot('core', Game.rooms.W23N22.getPositionAt(28, 42))
  Game.rooms.W23N22.addSpot('coresrc', Game.rooms.W23N22.getPositionAt(28, 44))
  Game.rooms.W23N22.addSpot('ctrl', Game.rooms.W23N22.getPositionAt(32, 11))
  Game.rooms.W23N22.addSpot('mineral', Game.rooms.W23N22.getPositionAt(5, 10))

  Game.rooms.W24N17.addSpot('aux', Game.rooms.W24N17.getPositionAt(11, 25))
  Game.rooms.W24N17.addSpot('auxsrc', Game.rooms.W24N17.getPositionAt(9, 25))
  Game.rooms.W24N17.addSpot('core', Game.rooms.W24N17.getPositionAt(18, 26))
  Game.rooms.W24N17.addSpot('coresrc', Game.rooms.W24N17.getPositionAt(20, 26))
  Game.rooms.W24N17.addSpot('ctrl', Game.rooms.W24N17.getPositionAt(32, 28))
  Game.rooms.W24N17.addSpot('mineral', Game.rooms.W24N17.getPositionAt(45, 12))

  Game.rooms.W25N23.addSpot('aux', Game.rooms.W25N23.getPositionAt(24, 36))
  Game.rooms.W25N23.addSpot('auxsrc', Game.rooms.W25N23.getPositionAt(26, 35))
  Game.rooms.W25N23.addSpot('core', Game.rooms.W25N23.getPositionAt(24, 43))
  Game.rooms.W25N23.addSpot('coresrc', Game.rooms.W25N23.getPositionAt(26, 42))
  Game.rooms.W25N23.addSpot('ctrl', Game.rooms.W25N23.getPositionAt(26, 32))
  Game.rooms.W25N23.addSpot('mineral', Game.rooms.W25N23.getPositionAt(12, 23))

  Game.rooms.W27N22.addSpot('aux', Game.rooms.W27N22.getPositionAt(28, 29))
  Game.rooms.W27N22.addSpot('auxsrc', Game.rooms.W27N22.getPositionAt(26, 30))
  Game.rooms.W27N22.addSpot('core', Game.rooms.W27N22.getPositionAt(17, 6))
  Game.rooms.W27N22.addSpot('coresrc', Game.rooms.W27N22.getPositionAt(16, 4))
  Game.rooms.W27N22.addSpot('ctrl', Game.rooms.W27N22.getPositionAt(25, 36))
  Game.rooms.W27N22.addSpot('mineral', Game.rooms.W27N22.getPositionAt(43, 11))
}

patch()

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

  Game.rooms.W24N17.drawSpots()

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
  shuffleRun(rooms, 5000, 'otherTowers')
  if (canRun(Game.cpu.getUsed(), 9000)) {
    terminals.run()
  }
  shuffleRun(flags, 9000, 'darkRun')
  shuffleRun(rooms, 9000,
    'runFlags',
    'runKeeper',
    'runLinks',
    'runTerminal',
    'spawningRun'
  )
  debug.log('Run', Math.floor(Game.cpu.getUsed()), '/', Game.cpu.limit, Game.cpu.bucket, Game.time)
}
