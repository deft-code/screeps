import * as debug from 'debug';
import * as routes from 'routes';
import * as k from 'constants';
import { RoomIntel } from 'intel';


function eggOrder(lname, rname) {
  const lpriority = _.get(Memory.creeps, `[${lname}].egg.priority`, 10)
  const rpriority = _.get(Memory.creeps, `[${rname}].egg.priority`, 10)
  const lage = Game.time - Memory.creeps[lname].egg.laid;
  const rage = Game.time - Memory.creeps[rname].egg.laid;
  return lpriority - rpriority || rage - lage;
}

export function run() {
  const all = _.keys(Memory.creeps)
  const eggNames = _.filter(all,
    (cname) => _.isObject(Memory.creeps[cname].egg))

  eggNames.sort(eggOrder)

  const done = {}
  for (let eggName of eggNames) {
    const eggMem = Memory.creeps[eggName].egg
    const t = Game.flags[eggMem.team]
    if (!t) {
      delete Memory.creeps[eggName]
      debug.log('Bad Egg!', eggName, JSON.stringify(eggMem))
      continue
    }
    const tr = t.pos.roomName
    if (done[tr]) continue
    const spawns = findSpawns(eggMem)
    const maxRCL = Math.max(...spawns.map(s => s.room.controller.level));
    const [spawn, body] = buildBody(spawns, eggMem, { maxRCL });
    if (!spawn) {

      continue
    }
    const sr = spawn.room.name
    if (done[sr]) continue
    //debug.log(egg, spawn, JSON.stringify(_.countBy(body)))
    //debug.log("spawning", egg, spawn.room.strat.spawnEnergy(spawn.room));
    const err = spawn.spawnCreep(body, eggName, { energyStructures: spawn.room.strat.spawnEnergy(spawn.room) });
    if (err !== OK) {
      spawn.room.log(spawn, 'FAILED to spawn', eggName, err, JSON.stringify(eggMem))
      if (Game.creeps[eggName]) {
        Game.creeps[eggName].log("Found Egg for existing creep!", JSON.stringify(eggMem));
        delete Memory.creeps[eggName].egg;
      } else if (Game.time - eggMem.laid > 500) {
        spawn.room.log("Egg Too Old!", eggName, JSON.stringify(eggMem));
        delete Memory.creeps[eggName];
      }
    } else {
      done[sr] = true
      done[tr] = true
      delete Memory.creeps[eggName].egg
      Memory.creeps[eggName].home = sr
      Memory.creeps[eggName].start = Game.time
    }
  }
}

export function closeSpawns(all, tname) {
  const mdist = _(all)
    .map(s => routes.dist(tname, s.pos.roomName))
    .min()
  return _.filter(all, s =>
    routes.dist(tname, s.pos.roomName) <= mdist + 1)
}

export function remoteSpawns(all, tname) {
  const mdist = _(all)
    .map(s => routes.dist(tname, s.pos.roomName))
    .filter(d => d > 0)
    .min()
  return _.filter(all, s => {
    const d = routes.dist(tname, s.room.name)
    return d > 0 && d <= mdist
  })
}

export function maxSpawns(all, tname) {
  const close = _.filter(all, s => routes.dist(tname, s.pos.roomName) <= 10)
  const mlvl = _.max(close.map(s => s.room.controller.level))
  const lvl = _.filter(close, s => s.room.controller.level >= mlvl)
  const mspawn = _.min(lvl, s => routes.dist(tname, s.pos.roomName))
  const mdist = routes.dist(tname, mspawn.pos.roomName) + 1
  return _.filter(lvl, s => routes.dist(tname, s.pos.roomName) <= mdist)
}

export function findSpawns(allSpawns, roomName, eggMem) {
  //const allSpawns = _.shuffle(Game.spawns)
  const tname = roomName;
  //const tname = Game.flags[eggMem.team].pos.roomName

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
    case 'max':
      spawns = maxSpawns(allSpawns, tname)
      break
    case 'remote':
      spawns = remoteSpawns(allSpawns, tname)
      break
    default:
      spawns = _.filter(allSpawns, s => s.room.name === eggMem.spawn)
      if (!spawns.length) {
        debug.log('Missing spawn algo', JSON.stringify(eggMem));
      }
      break
  }
  return _.filter(spawns, s => !s.spawning)
}

function buildCtrl(spawns, eggMem) {
  debug.log("ctrl eggmem:", JSON.stringify(eggMem));
  //Patch around manaual ctrl creations
  if (!eggMem.ecap) eggMem.ecap = _.first(spawns).room.energyCapacityAvailable;

  // Disable tiny ctrl
  if (false && eggMem.ecap > k.RCL7Energy) {
    return [
      _.find(spawns, s => s.room.energyAvailable >= 500), [
        MOVE, WORK, CARRY]]
  }

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

// Find full spawns with atleast min energy.
// Spawns considered full with energy >= max
// Default max of 2500 allows for full 50 part haulers
function energySpawn(spawns, min, max = 2500) {
  return _.find(spawns, s => s.room.energyCapacityAvailable >= min);
}

function harvesterBody(lvl = 0) {
  switch (lvl) {
    case 1: // 8 Work;
      return [WORK, WORK, MOVE, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, WORK, WORK, MOVE];
    case 2: // 10 Work;
      return [WORK, WORK, MOVE, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, WORK, WORK, MOVE, WORK, WORK, MOVE];
    case 3: // 11 Work
      return [WORK, WORK, MOVE, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, WORK, WORK, MOVE, WORK, WORK, MOVE, WORK, MOVE];
    case 4: // 13 Work
      return [WORK, WORK, MOVE, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, WORK, WORK, MOVE, WORK, WORK, MOVE, WORK, WORK, MOVE, WORK, MOVE];
    case 5: // 15 Work
      return [WORK, WORK, MOVE, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, WORK, WORK, MOVE, WORK, WORK, MOVE, WORK, WORK, MOVE, WORK, WORK, MOVE, WORK, MOVE];
  }
  // 6 Work
  return [WORK, WORK, MOVE, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE];
}

function trimBody(body, max) {
  let cost = 0;
  for (let i = 0; i < body.length; i++) {
    const pcost = BODYPART_COST[body[i]];
    if (cost + pcost > max) return body.slice(0, i);
    cost += pcost;
  }
  return body;
}

function srcerBody(spawns, eggMem) {
  const lvl = eggMem.lvl || 0;
  const idealBody = harvesterBody(lvl);
  const cost = bodyCost(idealBody);
  // Gradual down sizing if room is low RCL or damaged.
  const spawn = energySpawn(spawns, cost) || energySpawn(spawns, 800) || energySpawn(spawns, 550) || energySpawn(spawns, 300);
  debug.log("found spawn:", spawn, "from spawns", spawns, "@cost", cost);
  if (!spawn) return [null, idealBody];

  // Make sure srcer capacity == extension capacity
  const rcl = spawn.room.controller.level;
  if (rcl === 7) {
    idealBody.push(CARRY);
  } else if (rcl === 8) {
    idealBody.push(CARRY, CARRY, CARRY);
  }
  const max = spawn.room.energyAvailable;
  const body = trimBody(idealBody, max);
  return [spawn, body];
}

function depositBody(spawn, eggMem) {
  const team = Game.flags[eggMem.team];
  let works = 11;
  if (team) {
    const intel = RoomIntel.get(team.pos.roomName);
    if (intel) {
      const d = routes.dist(spawn.pos.roomName, team.pos.roomName);
      const cooldown = intel.depositCooldown;
      const workTicks = CREEP_LIFE_TIME - 100 * d;
      for (; works <= 21; works++) {
        const fillIntents = ((25 - works) * CARRY_CAPACITY) / works;
        if (cooldown < workTicks / fillIntents) break;
      }
    }
  }
  const carries = 25 - works;
  const body = Array(works).fill(WORK);
  for (let i = 0; i < carries; i++) {
    body.push(CARRY, MOVE);
  }
  body.push(...Array(works).fill(MOVE));
  return body;
}

export function buildBody(spawns, eggMem, { maxRCL }) {
  let spawn
  let body = []
  let e
  debug.log("building body:", JSON.stringify(eggMem));
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
      body = [CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE,
        CARRY, CARRY, MOVE]
      spawn = energySpawn(spawns, bodyCost(body))
      if (!spawn) break
      break
    case 'claimer':
      body = [MOVE, CLAIM]
      spawn = energySpawn(spawns, bodyCost(body))
      break
    case 'cap':
      body = [MOVE, CARRY, CARRY];
      if (maxRCL >= 7) body.push(...body);
      if (maxRCL === 8) body.push(...body);
      spawn = _.find(spawns, s => s.room.energyAvailable > bodyCost(body));
      break;
    case 'cleaner':
      spawn = energySpawn(spawns, 650)
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [CARRY, WORK, WORK, WORK, WORK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'collector':
      spawn = energySpawn(spawns, 800)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'coresrc':
      body = [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE]
      e = bodyCost(body)
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= e)
      break
    case 'ctrl':
      [spawn, body] = buildCtrl(spawns, eggMem)
      break
    case 'declaimer':
      spawn = energySpawn(spawns, 650)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [CLAIM],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'defender':
      spawn = _.find(spawns,
        s => s.room.energyAvailable * 2 >= s.room.energyCapacityAvailable)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [ATTACK],
        energy: spawn.room.energyAvailable
      }))
      break
    case 'depositfarmer':
      spawn = energySpawn(spawns, 600, 3350)
      if (!spawn) break
      body = depositBody(spawn, eggMem);
      // body = energyDef({
      //   move: 1,
      //   base: [WORK, MOVE],
      //   per: [WORK, WORK, CARRY],
      //   energy: spawn.room.energyAvailable
      // });
      break
    case 'hauler':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= eggMem.energy)
      if (!spawn) break
      if (spawn.room.energyAvailable < 550) {
        eggMem.energy = spawn.room.energyAvailable
      }
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY]
      }))
      break
    case 'hub':
      body = [CARRY, CARRY,
        CARRY, CARRY,
        CARRY, CARRY,
        CARRY, CARRY,
        CARRY, MOVE];
      debug.log("hub spawns:", spawns);
      spawn = _.find(spawns, s => s.room.energyAvailable >= 500);
      break;
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
    case 'mason':
      body = [
        WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK,
        CARRY, MOVE,
      ];
      // body = _.repeat(body, 5);
      // body = [
      //   WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
      //   WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
      //   WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
      //   WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
      //   CARRY, CARRY, CARRY, CARRY, CARRY,
      //   MOVE, MOVE, MOVE, MOVE, MOVE,
      // ];
      spawn = energySpawn(spawns, bodyCost(body));
      break;
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
      spawn = energySpawn(spawns, 800) ||
        energySpawn(spawns, 550) ||
        energySpawn(spawns, 400)
      if (!spawn) break
      e = spawn.room.energyAvailable
      body = [MOVE, CARRY, WORK, WORK, WORK]
      if (e >= 450) body = [MOVE, MOVE, CARRY, WORK, WORK, WORK]
      if (e >= 500) body = [MOVE, CARRY, WORK, WORK, WORK, WORK]
      if (e >= 550) body = [MOVE, MOVE, CARRY, WORK, WORK, WORK, WORK]
      if (e >= 600) body = [MOVE, CARRY, WORK, WORK, WORK, WORK, WORK]
      if (e >= 650) body = [MOVE, MOVE, CARRY, WORK, WORK, WORK, WORK, WORK]
      if (e >= 700) body = [MOVE, MOVE, MOVE, CARRY, WORK, WORK, WORK, WORK, WORK]
      if (e >= 800) body = [MOVE, MOVE, MOVE, CARRY, WORK, WORK, WORK, WORK, WORK, WORK]
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
      body = [RANGED_ATTACK, MOVE, MOVE, HEAL]
      e = bodyCost(body)
      spawn = _.find(spawns, s => s.room.energyAvailable >= e)
      break
    case 'rambo':
      body = [
        TOUGH, TOUGH, TOUGH, TOUGH,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL]
      spawn = energySpawn(spawns, bodyCost(body))
      break
    case 'reboot':
      body = [WORK, CARRY, MOVE]
      e = bodyCost(body)
      spawn = _.find(spawns, s => s.room.energyAvailable >= e)
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
      break
    case 'shunt':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 250)
      body = [CARRY, CARRY, CARRY, CARRY, MOVE]
      break
    case 'srcer':
      [spawn, body] = srcerBody(spawns, eggMem);
      break;
    case 'startup':
      debug.log('startup')
      spawn = energySpawn(spawns, 300)
      debug.log('startup', spawn)
      if (!spawn) break
      switch (spawn.room.energyCapacityAvailable) {
        case 300: body = [WORK, WORK, CARRY, MOVE]; break
        case 350: body = [WORK, WORK, CARRY, MOVE, MOVE]; break
        case 400:
        case 450: body = [WORK, WORK, CARRY, CARRY, MOVE, MOVE]; break
        case 500: body = [WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE]; break
        case 550: body = [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]; break
        default:
          body = energyDef({
            move: 2,
            base: [MOVE, CARRY],
            per: [WORK, CARRY],
            energy: spawn.room.energyAvailable
          })
          break
      }
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

function bodyCost(body) {
  return _.sum(body, part => BODYPART_COST[part])
}

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
  //parts = _.map(parts, part => part === 'premove'? MOVE: part);
  parts = _.map(parts, part => {
    if (part === 'premove') return MOVE
    return part
  })
  return parts
}

function energyDef(def) {
  def.level = 2
  let cost = defCost(def)
  const max = def.max || 50
  while (cost <= def.energy && def.level <= max) {
    def.level++
    cost = defCost(def)
  }
  def.level--
  return defBody(def)
}
