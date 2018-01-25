const debug = require('debug')
const routes = require('routes')
const k = require('constants')

function eggOrder (lname, rname) {
  const lpriority = _.get(Memory.creeps, `[${lname}].egg.priority`, 10)
  const rpriority = _.get(Memory.creeps, `[${rname}].egg.priority`, 10)
  return lpriority - rpriority
}

exports.run = () => {
  const all = _.keys(Memory.creeps)
  const eggs = _.filter(all,
    (cname) => _.isObject(Memory.creeps[cname].egg))

  eggs.sort(eggOrder)

  for (let egg of eggs) {
    const ret = runEgg(egg)
    if (ret) return ret
  }
}

function runEgg (egg) {
  const eggMem = Memory.creeps[egg].egg
  const spawns = findSpawns(eggMem)
  const [spawn, body] = buildBody(spawns, eggMem)
  if (!spawn) return false
  debug.log(egg, spawn, JSON.stringify(_.countBy(body)))

  const err = spawn.spawnCreep(body, egg)
  if (err !== OK) {
    debug.log(spawn, 'Failed to spawn', egg, err, JSON.stringify(eggMem))
  } else {
    delete Memory.creeps[egg].egg
  }
}

function closeSpawns (all, tname) {
  const mdist = _(all)
    .map(s => routes.dist(tname, s.pos.roomName))
    .min()
  return _.filter(all, s =>
    routes.dist(tname, s.pos.roomName) <= mdist + 1)
}

function remoteSpawns (all, tname) {
  const mdist = _(all)
    .map(s => routes.dist(tname, s.pos.roomName))
    .filter(d => d > 0)
    .min()
  return _.filter(all, s => {
    const d = routes.dist(tname, s.room.name)
    return d > 0 && d <= mdist
  })
}

function findSpawns (eggMem) {
  const allSpawns = _.shuffle(Game.spawns)
  const tname = Game.flags[eggMem.team].pos.roomName

  let spawns = []
  switch (eggMem.spawn) {
    case 'local':
      let dist = 11
      for (const s of allSpawns) {
        const room = s.pos.roomName
        const d = routes.dist(tname, room)
        if (d < dist) {
          dist = d
          spawns = [s]
        } else if (d === dist) {
          spawns.push(s)
        }
      }
      break
    case 'close':
      spawns = closeSpawns(allSpawns, tname)
      break
    case 'remote':
      spawns = remoteSpawns(allSpawns, tname)
      break
    default:
      debug.log('Missing spawn algo', eggMem.spawn)
      break
  }
  return _.filter(spawns, s => !s.spawning)
}

function buildCtrl (spawns, eggMem) {
  if (eggMem.ecap > k.RCL7Energy) {
    return [
      _.find(spawns, s => s.room.energyAvailable >= 2050), [
        MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY]]
  }

  if (eggMem.ecap > k.RCL6Energy) {
    const spawn = _.find(spawns, s => s.room.energyAvailable >= 4200)
    if (!spawn) return [null, []]

    return [spawn, [
      MOVE, MOVE, MOVE, MOVE, MOVE,
      MOVE, MOVE, MOVE, MOVE, MOVE,
      MOVE, MOVE, MOVE, MOVE, MOVE,

      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,

      CARRY, CARRY, CARRY, CARRY, CARRY]]
  }

  const spawn = _.find(spawns, s => s.room.energyAvailable >= eggMem.ecap)
  if (!spawn) return [null, []]

  const def = {
    move: 2,
    per: [WORK],
    base: [CARRY],
    energy: eggMem.ecap
  }

  if (eggMem.ecap > k.RCL4Energy) {
    def.base.push(CARRY)
  }

  const body = energyDef(def)

  return [spawn, body]
}

function energySpawn (spawns, min, max = 12300) {
  return _.find(spawns,
        s => (s.room.energyAvailable >= max || s.room.energyFreeAvailable === 0) &&
            s.room.energyCapacityAvailable >= min)
}

function buildBody (spawns, eggMem) {
  let spawn
  let body = []
  switch (eggMem.body) {
    case 'bootstrap':
      spawn = energySpawn(spawns, 1300)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY, WORK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'bulldozer':
      spawn = energySpawn(spawns, 700)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [WORK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'cart':
      spawn = energySpawn(spawns, 550)
      if (!spawn) break
      body = energyDef({
        move: 1,
        base: [WORK, MOVE],
        per: [CARRY],
        energy: spawn.room.energyAvailable
      })
      break
    case 'chemist':
      spawn = energySpawn(spawns, 750)
      if (!spawn) break
      body = [CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE]
      break
    case 'claimer':
      spawn = energySpawn(spawns, 650)
      if (!spawn) break
      body = [MOVE, CLAIM]
      break
    case 'cleaner':
      spawn = energySpawn(spawns, 650)
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [CARRY, WORK, WORK, WORK, WORK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'coresrc':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 700)
      if (!spawn) break
      body = [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE]
      break
    case 'ctrl':
      [spawn, body] = buildCtrl(spawns, eggMem)
      break
    case 'defender':
      spawn = _.find(spawns,
        s => s.room.energyAvailable * 2 >= s.room.energyCapacityAvailable)
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [ATTACK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'hauler':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= eggMem.energy)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY]
      }))
      break
    case 'farmer':
      spawn = energySpawn(spawns, 550)
      if (!spawn) break
      body = energyDef({
        move: 1,
        per: [WORK, CARRY, CARRY],
        energy: spawn.room.energyAvailable
      })
      break
    case 'guard':
      spawn = energySpawn(spawns, 550)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        base: [MOVE, HEAL],
        per: [TOUGH, RANGED_ATTACK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'micro':
      spawn = _.find(spawns, s => s.room.energyAvailable >= 300)
      body = [MOVE, ATTACK]
      break
    case 'minecart':
      spawn = energySpawn(spawns, 800)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'miner':
      spawn = energySpawn(spawns, 800)
      if (!spawn) break
      body = [MOVE, MOVE, MOVE, CARRY, WORK, WORK, WORK, WORK, WORK, WORK]
      if (spawn.room.energyAvailable >= 800) {
        body.push(MOVE, MOVE)
      }
      break
    case 'mineral':
      spawn = energySpawn(spawns, 800)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 4,
        per: [WORK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'mini':
      spawn = _.find(spawns, s => s.room.energyAvailable >= 500)
      body = [RANGED_ATTACK, MOVE, MOVE, HEAL]
      break
    case 'reboot':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 200)
      body = [WORK, CARRY, MOVE]
      break
    case 'reserver':
      spawn = energySpawn(spawns, 650)
      if (!spawn) break
      if (spawn.room.energyAvailable < 1300) {
        body = [MOVE, CLAIM]
      } else if (spawn.room.energyAvailable < 1950) {
        body = [MOVE, MOVE, CLAIM, CLAIM]
      } else if (spawn.room.energyAvailable < 2600) {
        body = [MOVE, MOVE, MOVE, CLAIM, CLAIM, CLAIM]
      } else {
        body = energyDef(_.defaults({}, eggMem, {
          move: 1,
          per: [CLAIM],
          energy: spawn.room.energyAvailable,
          max: 10
        }))
      }
      break
    case 'scout':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 300)
      body = [MOVE]
      debug.log('scout', spawns, spawn, body)
      break
    case 'shunt':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 250)
      body = [CARRY, CARRY, CARRY, CARRY, MOVE]
      break
    case 'tower':
      spawn = energySpawn(spawns, 1300)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        base: [MOVE, HEAL],
        per: [RANGED_ATTACK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'wolf':
      spawn = energySpawn(spawns, 700)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [ATTACK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'worker':
      spawn = energySpawn(spawns, 300, 3300)
      if (!spawn) break
      body = energyDef({
        move: 2,
        base: [MOVE, CARRY],
        per: [WORK, CARRY],
        energy: spawn.room.energyAvailable
      })
      break
    default:
      debug.log('Missing body algo', eggMem.body)
      break
  }
  return [spawn, body]
}

const partsOrdered = [TOUGH, WORK, CARRY, 'premove', ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL]
const partPriority = (part) => _.indexOf(partsOrdered, part)
const orderParts = (l, r) => partPriority(l) - partPriority(r)

// const sortFromOrder = (items, order) => items.sort((l, r) => _.indexOf(order, l) - _.indexOf(order, r))

const defCost = (def) => {
  let cost = 0
  let max = 50
  if (def.base) {
    max -= def.base.length
    cost += _.sum(def.base, part => BODYPART_COST[part])
  }
  cost += def.level * _.sum(def.per, part => BODYPART_COST[part])
  const nparts = def.level * def.per.length

  // short circuit 0 move definitions.
  const nmove = def.move && Math.ceil(nparts / def.move)
  if (nparts + nmove > max) {
    return Infinity
  }
  return cost + BODYPART_COST[MOVE] * nmove
}

const defBody = (def) => {
  let parts = []
  for (let i = 0; i < def.level; i++) {
    parts = parts.concat(def.per)
  }
  const move = def.move && Math.ceil(parts.length / def.move)
  for (let i = 0; i < move; i++) {
    if (i < move / 2) {
      parts.push('premove')
    } else {
      parts.push(MOVE)
    }
  }

  if (def.base) {
    parts = parts.concat(def.base)
  }

  parts.sort(orderParts)
  parts = _.map(parts, part => {
    if (part === 'premove') return MOVE
    return part
  })
  return parts
}

function energyDef (def) {
  def.level = 2
  let cost = defCost(def)
  const max = def.max || 50
  while (cost < def.energy && def.level <= max) {
    def.level++
    cost = defCost(def)
  }
  def.level--
  return defBody(def)
}
