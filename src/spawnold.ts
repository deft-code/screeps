import * as debug from 'debug';
import * as routes from 'routes';
import * as k from 'constants';
import { RoomIntel } from 'intel';

// The 2017 body table. findSpawns picks the spawns an egg may hatch from
// (by the egg's `spawn` strategy or room name) and buildBody sizes a body
// by the egg's `body` key; both are live through JobRole/JobCreep and the
// job classes that call them. `run` is the flag-team spawner of 2017,
// dead since the `return` in main (the SpawnDaemon spawns now).

// What the body table reads from an egg: Memory.creeps[name].egg of the
// flag-team era, or the plain object a job's spawn() builds.
export interface EggMem {
  // Key into buildBody's table (a role name).
  body?: string
  // 'local' | 'close' | 'max' | 'remote', or a room name.
  spawn?: string
  team?: string
  priority?: number
  laid?: number
  // Spawn energy capacity the body is sized to (ctrl).
  ecap?: number
  // Energy the body is sized to (hauler).
  energy?: number
  // Harvester body level (srcer).
  lvl?: number
  // energyDef overrides.
  move?: number
  per?: BodyPartConstant[]
  base?: BodyPartConstant[]
  max?: number
  interleave?: boolean
  movesFirst?: boolean
}

// The flag-team egg as run() read it.
type LegacyEgg = EggMem & { team: string, laid: number }

type DefPart = BodyPartConstant | 'premove'

interface BodyDef {
  // `per` parts per MOVE (0: no MOVEs).
  move: number
  per: BodyPartConstant[]
  base?: BodyPartConstant[]
  interleave?: boolean
  movesFirst?: boolean
}

interface EnergyDef extends BodyDef {
  energy: number
  max?: number
}

interface LevelDef extends BodyDef {
  level: number
}

export type SpawnBody = [StructureSpawn | null | undefined, BodyPartConstant[]]

function legacyEgg(name: string): LegacyEgg {
  return Memory.creeps[name].egg as unknown as LegacyEgg
}

function eggOrder(lname: string, rname: string) {
  const lpriority = _.get(Memory.creeps, `[${lname}].egg.priority`, 10)
  const rpriority = _.get(Memory.creeps, `[${rname}].egg.priority`, 10)
  const lage = Game.time - legacyEgg(lname).laid;
  const rage = Game.time - legacyEgg(rname).laid;
  return lpriority - rpriority || rage - lage;
}

export function run() {
  const all = _.keys(Memory.creeps)
  const eggNames = _.filter(all,
    (cname) => _.isObject(Memory.creeps[cname].egg))

  eggNames.sort(eggOrder)

  const done: { [roomName: string]: boolean } = {}
  for (let eggName of eggNames) {
    const eggMem = legacyEgg(eggName)
    const t = Game.flags[eggMem.team]
    if (!t) {
      delete Memory.creeps[eggName]
      debug.log('Bad Egg!', eggName, JSON.stringify(eggMem))
      continue
    }
    const tr = t.pos.roomName
    if (done[tr]) continue
    const spawns = findSpawns(_.values<StructureSpawn>(Game.spawns), tr, eggMem)
    const maxRCL = Math.max(...spawns.map(s => s.room.controller!.level));
    const [spawn, body] = buildBody(spawns, eggMem, { maxRCL });
    if (!spawn) {

      continue
    }
    const sr = spawn.room.name
    if (done[sr]) continue
    //debug.log(egg, spawn, JSON.stringify(_.countBy(body)))
    //debug.log("spawning", egg, spawn.room.strat.spawnEnergy(spawn.room));
    const err = spawn.spawnCreep(body, eggName, { energyStructures: spawn.room.strat.spawnEnergy() });
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

// Spawns in rooms we own. An unclaimed room's spawn stays in Game.spawns
// (W27S5's Forth, Oct 2026) but cannot spawn: the pools below leave it out,
// else eggs wait on it for good.
export function liveSpawns(all: StructureSpawn[]): StructureSpawn[] {
  return _.filter(all, s => !!s.room.controller && s.room.controller.my)
}

export function closeSpawns(all: StructureSpawn[], tname: string): StructureSpawn[] {
  all = liveSpawns(all)
  const mdist = _(all)
    .map(s => routes.dist(tname, s.pos.roomName))
    .min()
  return _.filter(all, s =>
    routes.dist(tname, s.pos.roomName) <= mdist + 1)
}

export function remoteSpawns(all: StructureSpawn[], tname: string): StructureSpawn[] {
  all = liveSpawns(all)
  const mdist = _(all)
    .map(s => routes.dist(tname, s.pos.roomName))
    .filter(d => d > 0)
    .min()
  return _.filter(all, s => {
    const d = routes.dist(tname, s.room.name)
    return d > 0 && d <= mdist
  })
}

export function maxSpawns(all: StructureSpawn[], tname: string): StructureSpawn[] {
  const close = _.filter(liveSpawns(all), s => routes.dist(tname, s.pos.roomName) <= 10)
  const mlvl = _.max(close.map(s => s.room.controller!.level))
  const lvl = _.filter(close, s => s.room.controller!.level >= mlvl)
  const mspawn = _.min(lvl, s => routes.dist(tname, s.pos.roomName))
  const mdist = routes.dist(tname, mspawn.pos.roomName) + 1
  return _.filter(lvl, s => routes.dist(tname, s.pos.roomName) <= mdist)
}

// The idle spawns an egg for `roomName` may hatch from, by eggMem.spawn.
export function findSpawns(allSpawns: StructureSpawn[], roomName: string, eggMem: EggMem): StructureSpawn[] {
  //const allSpawns = _.shuffle(Game.spawns)
  const tname = roomName;
  //const tname = Game.flags[eggMem.team].pos.roomName
  allSpawns = liveSpawns(allSpawns)

  let spawns: StructureSpawn[] = []
  switch (eggMem.spawn) {
    case 'local': {
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
    }
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

function buildCtrl(spawns: StructureSpawn[], eggMem: EggMem): SpawnBody {
  debug.log("ctrl eggmem:", JSON.stringify(eggMem));
  //Patch around manaual ctrl creations
  if (!eggMem.ecap) eggMem.ecap = _.first(spawns)!.room.energyCapacityAvailable;
  const ecap = eggMem.ecap

  // (A tiny RCL8 ctrl, [MOVE, WORK, CARRY], was disabled here.)

  if (ecap > k.RCL7Energy) {
    return [
      _.find(spawns, s => s.room.energyAvailable >= 2050), [
        MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY]]
  }

  if (ecap > k.RCL6Energy) {
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

  const spawn = _.find(spawns, s => s.room.energyAvailable >= ecap)
  if (!spawn) return [null, []]

  const base: BodyPartConstant[] = [CARRY]
  const def: EnergyDef = {
    move: 2,
    per: [WORK],
    base,
    energy: ecap
  }

  if (ecap > k.RCL4Energy) {
    base.push(CARRY)
  }

  const body = energyDef(def)

  return [spawn, body]
}

// Find full spawns with atleast min energy.
// Spawns considered full with energy >= max
// Default max of 2500 allows for full 50 part haulers
// Least energy a wolf body is sized to: 4 ATTACK + 4 MOVE (520).
const kWolfMinEnergy = 550

function energySpawn(spawns: StructureSpawn[], min: number, _max = 2500) {
  return _.find(spawns, s => s.room.energyCapacityAvailable >= min);
}

function harvesterBody(lvl = 0): BodyPartConstant[] {
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

function trimBody(body: BodyPartConstant[], max: number): BodyPartConstant[] {
  let cost = 0;
  for (let i = 0; i < body.length; i++) {
    const pcost = BODYPART_COST[body[i]];
    if (cost + pcost > max) return body.slice(0, i);
    cost += pcost;
  }
  return body;
}

function srcerBody(spawns: StructureSpawn[], eggMem: EggMem): SpawnBody {
  const lvl = eggMem.lvl || 0;
  const idealBody = harvesterBody(lvl);
  const cost = bodyCost(idealBody);
  // Gradual down sizing if room is low RCL or damaged.
  const spawn = energySpawn(spawns, cost) || energySpawn(spawns, 800) || energySpawn(spawns, 550) || energySpawn(spawns, 300);
  debug.log("found spawn:", spawn, "from spawns", spawns, "@cost", cost);
  if (!spawn) return [null, idealBody];

  // Make sure srcer capacity == extension capacity
  const rcl = spawn.room.controller!.level;
  if (rcl === 7) {
    idealBody.push(CARRY);
  } else if (rcl === 8) {
    idealBody.push(CARRY, CARRY, CARRY);
  }
  // Size to what the room can hold, not what it holds right now: the
  // SpawnDaemon waits for the energy. Trimming to energyAvailable spawned
  // lone [WORK] srcers that could never move (Hub W25S7, 2026-09).
  const max = spawn.room.energyCapacityAvailable;
  const body = trimBody(idealBody, max);
  // Never less than something that can walk to its source.
  if (bodyCost(body) < bodyCost(kMinSrcer)) return [spawn, kMinSrcer.slice()];
  return [spawn, body];
}
const kMinSrcer: BodyPartConstant[] = [WORK, WORK, MOVE];

function depositBody(spawn: StructureSpawn, eggMem: EggMem): BodyPartConstant[] {
  const team = eggMem.team ? Game.flags[eggMem.team] : undefined;
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
  const body: BodyPartConstant[] = Array(works).fill(WORK);
  for (let i = 0; i < carries; i++) {
    body.push(CARRY, MOVE);
  }
  body.push(...Array<BodyPartConstant>(works).fill(MOVE));
  return body;
}

// A spawn with the energy and the body for eggMem.body; [null/undefined, []]
// (or [undefined, body]) when no spawn can take it right now.
export function buildBody(spawns: StructureSpawn[], eggMem: EggMem, { maxRCL }: { maxRCL: number }): SpawnBody {
  let spawn: StructureSpawn | null | undefined
  let body: BodyPartConstant[] = []
  let e: number
  debug.log("building body:", JSON.stringify(eggMem));
  switch (eggMem.body) {
    case 'bootstrap':
      spawn = energySpawn(spawns, 1300)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY, WORK],
        energy: spawn.room.energyAvailable
      }) as EnergyDef)
      break
    case 'bulldozer':
      spawn = energySpawn(spawns, 700)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [WORK],
        energy: spawn.room.energyAvailable
      }) as EnergyDef)
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
    case 'immortan':
      // 5 MOVE per CLAIM: 1 fatigue/tick on plain, 10 on swamp, against 10
      // recovery, so the walk to the sector core costs nothing on swamps.
      // One CARRY (empty on the walk, so no fatigue) to tidy spilled thorium
      // into the reactor; ordered so the CLAIM part dies last.
      body = [MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CLAIM]
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
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [CARRY, WORK, WORK, WORK, WORK],
        energy: spawn.room.energyAvailable
      }) as EnergyDef)
      break
    case 'collector':
      spawn = energySpawn(spawns, 800)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY],
        energy: spawn.room.energyAvailable
      }) as EnergyDef)
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
      }) as EnergyDef)
      break
    case 'defender':
      spawn = _.find(spawns,
        s => s.room.energyAvailable * 2 >= s.room.energyCapacityAvailable)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [ATTACK],
        energy: spawn.room.energyAvailable
      }) as EnergyDef)
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
    case 'hauler': {
      // No `energy` on the egg: no spawn (as the JS comparison with undefined).
      const want = eggMem.energy ?? NaN
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= want)
      if (!spawn) break
      if (spawn.room.energyAvailable < 550) {
        eggMem.energy = spawn.room.energyAvailable
      }
      // CARRY, CARRY, MOVE repeated: a hauler losing parts from the front
      // loses weight and speed together.
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY],
        interleave: true
      }) as EnergyDef)
      break
    }
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
      // movesFirst: every MOVE ahead of the weapons (after TOUGH), so the
      // guard keeps its speed until its weapons are gone (docs/spawning.md).
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        base: [MOVE, HEAL],
        per: [TOUGH, RANGED_ATTACK],
        movesFirst: true,
        energy: spawn.room.energyAvailable
      }) as EnergyDef)
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
      }) as EnergyDef)
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
      }) as EnergyDef)
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
        }) as EnergyDef)
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
      }) as EnergyDef)
      break
    case 'upgrader':
      // Surplus sink for job.upgrader.ts: two WORK per CARRY, one MOVE per
      // two parts, sized from the energy banked in the room.
      spawn = energySpawn(spawns, 550)
      if (!spawn) break
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        base: [MOVE, CARRY],
        per: [WORK, WORK, CARRY],
        energy: spawn.room.energyAvailable
      }) as EnergyDef)
      break
    case 'wolf':
      spawn = energySpawn(spawns, 700)
      if (!spawn) break
      // Sized to at least kWolfMinEnergy, so a drained room waits (the
      // SpawnDaemon skips bodies it cannot afford) instead of spawning a
      // 1 ATTACK + 1 MOVE wolf; more energy on hand buys a bigger one.
      body = energyDef(_.defaults({}, eggMem, {
        move: 1,
        per: [ATTACK],
        energy: Math.max(kWolfMinEnergy, spawn.room.energyAvailable)
      }) as EnergyDef)
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

const partsOrdered: DefPart[] = [TOUGH, WORK, CARRY, 'premove', ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL]
const partPriority = (part: DefPart) => _.indexOf(partsOrdered, part)
const orderParts = (l: DefPart, r: DefPart) => partPriority(l) - partPriority(r)

// const sortFromOrder = (items, order) => items.sort((l, r) => _.indexOf(order, l) - _.indexOf(order, r))

function bodyCost(body: BodyPartConstant[]): number {
  return _.sum(body, part => BODYPART_COST[part])
}

const defCost = (def: LevelDef): number => {
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

// Interleaved layout (def.interleave): after every `move` parts of `per` one
// MOVE, the last group's MOVE covering the remainder, so the MOVE count
// matches defCost. Non-MOVE base parts lead, MOVE base parts trail. Damage
// then strips MOVEs and the parts they carry in step. Same as spawn.ts.
const defBodyInterleaved = (def: LevelDef): BodyPartConstant[] => {
  let per: BodyPartConstant[] = []
  for (let i = 0; i < def.level; i++) {
    per = per.concat(def.per)
  }
  const body: BodyPartConstant[] = []
  const base = def.base || []
  body.push(...base.filter(part => part !== MOVE).sort(orderParts))
  per.forEach((part, i) => {
    body.push(part)
    if (def.move && ((i + 1) % def.move === 0 || i === per.length - 1)) body.push(MOVE)
  })
  body.push(...base.filter(part => part === MOVE))
  return body
}

const defBody = (def: LevelDef): BodyPartConstant[] => {
  if (def.interleave) return defBodyInterleaved(def)
  let parts: DefPart[] = []
  for (let i = 0; i < def.level; i++) {
    parts = parts.concat(def.per)
  }
  // Half the MOVEs sort early ('premove'); with def.movesFirst all of them
  // do, base MOVEs included, so only TOUGH stands ahead of them. Same as
  // spawn.ts.
  const move = def.move && Math.ceil(parts.length / def.move)
  for (let i = 0; i < move; i++) {
    if (def.movesFirst || i < move / 2) {
      parts.push('premove')
    } else {
      parts.push(MOVE)
    }
  }

  if (def.base) {
    parts = parts.concat(def.movesFirst ? def.base.map(part => part === MOVE ? 'premove' : part) : def.base)
  }

  parts.sort(orderParts)
  //parts = _.map(parts, part => part === 'premove'? MOVE: part);
  return _.map(parts, part => {
    if (part === 'premove') return MOVE
    return part
  })
}

// The biggest body of def's shape that def.energy pays for.
function energyDef(def: EnergyDef): BodyPartConstant[] {
  const ldef = def as EnergyDef & LevelDef
  ldef.level = 2
  let cost = defCost(ldef)
  const max = def.max || 50
  while (cost <= def.energy && ldef.level <= max) {
    ldef.level++
    cost = defCost(ldef)
  }
  ldef.level--
  return defBody(ldef)
}
