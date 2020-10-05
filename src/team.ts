import { FlagExtra } from "flag";
import { Path, PathMem } from "path";
import { injecter } from "roomobj";

import * as k from 'constants';
import * as lib from 'lib';
import * as matrix from 'matrix';
import { RoomIntel } from "intel";
import { getSpots } from "spots";
import { depositMaxCooldown, depositDist, depositMaxCooldownByDist } from "deposit";

declare global {
  interface Memory {
    logo: number[]
  }
  interface FlagMemory {
    creeps?: string[];
    depositDist?: number
  }
}

@injecter(Flag)
class TeamExtra extends FlagExtra {
  _creeps?: Creep[]
  _creepsByRole?: {
    [role: string]: Creep[]
  }
  _countByRole?: {
    [role: string]: number
  }
  get creeps() {
    if (!this._creeps) {
      this._creeps = _.filter(_.map(this.memory.creeps!, c => Game.creeps[c]), c => c && !c.spawning);
    }
    return this._creeps
  }

  get creepsByRole() {
    if (!this._creepsByRole) {
      this._creepsByRole = _.groupBy(this.creeps, 'role')
    }
    return this._creepsByRole
  }

  get countByRole() {
    if (!this._countByRole) {
      this._countByRole = _.countBy(this.memory.creeps!,
        n => _.first(_.words(n)))
    }
    return this._countByRole
  }

  countRole(role: string) {
    return this.countByRole[role] || 0
  }

  roleCreeps(role: string) {
    return this.creepsByRole[role] || []
  }

  darkTeam() {
    const gone = gc(this)
    if (gone.length) {
      this.log('Cleaned up', gone)
    }

    if (this.secondaryColor === COLOR_BROWN) {
      return this.teamDone()
    }

    if (this.what().toLowerCase() === 'logo') {
      logoDraw(this)
    }

    return this.paceRole('scout', 1500, {})
  }

  runTeam() {
    const gone = gc(this)
    if (gone.length) {
      this.dlog('Cleaned up', gone)
    }

    switch (this.secondaryColor) {
      case COLOR_BLUE: return this.teamCore()
      case COLOR_BROWN: return this.teamDone()
      case COLOR_GREEN: return this.teamHub()
      case COLOR_GREY: return this.teamWho()
      case COLOR_RED: return this.teamWhat()
      case COLOR_YELLOW: return this.teamRemote()
      case COLOR_WHITE: return this.teamOnce()
    }
    this.log('Missing team')
    return false;
  }

  teamOnce() {
    if (this.creeps.length) {
      this.setColor(COLOR_BLUE, COLOR_BROWN)
    }
    return this.teamWho()
  }

  teamWhat(): boolean {
    const w = this.what().toLowerCase()
    switch (w) {
      case 'declaim':
        return this.teamDeclaim()
      case 'wipe':
        return this.teamWipe()
      case 'logo':
        return this.teamLogo()
      case 'commando':
        return this.teamCommando()
      case 'startup': return this.teamStartup()
      case 'kraken': return this.teamKraken();
      case 'zombie': return this.teamZombie()
      case 'deposit': return this.teamDeposit();
      default:
        this.log('Bad Mission', w)
    }
    return false
  }

  teamStartup() {
    if (this.room!.storage && this.room!.storage.my) {
      this.pos.createFlag('Home', COLOR_BLUE, COLOR_BLUE)
      this.setColor(COLOR_BLUE, COLOR_BROWN)
    }
    const cap = this.room!.energyCapacityAvailable
    return reboot(this) ||
      startup(this) ||
      suppressMicro(this) ||
      (cap < 550) ||
      controller(this) ||
      hauler(this) ||
      harvester(this) ||
      (cap < 800) ||
      worker(this)
  }

  teamCommando() {
    const ntowers = this.room!.findStructs(STRUCTURE_TOWER).length
    if (ntowers > 3) return false
    let role = 'rambo'
    if (ntowers > 2) return true;
    if (this.memory.junior) {
      role += 'jr'
    }
    return this.paceRole(role, 1400)
  }

  teamZombie() {
    let n = 1200
    let r = 0
    if (this.room) {
      if (this.room!.storage) r += this.room!.storage.store.getUsedCapacity()
      if (this.room!.terminal) r += this.room!.terminal.store.getUsedCapacity()
    }
    if (r > 100000) n = 900
    if (r > 200000) n = 600
    if (r > 300000) n = 300

    return this.paceRole('zombiefarmer', n)
  }

  teamDeposit() {
    const intel = RoomIntel.get(this.pos.roomName);
    if (!intel) {
      this.log("missing intel!");
      this.setColor(COLOR_BLUE, COLOR_BROWN);
      return false;
    }
    const dist = this.memory.depositDist = this.memory.depositDist || depositDist(this.pos.roomName);
    const max = depositMaxCooldownByDist(dist);
    const cooldown = intel.depositCooldown;
    if (!intel.depositTTL || cooldown > max) {
      this.setColor(COLOR_BLUE, COLOR_BROWN);
      return false;
    }
    let nspots = getSpots(this.pos).length;

    // Farmers on younger deposit will make multiple trips, essentially doubling the number or workers.
    // This usually more than compensates for extra travel time.

    return this.paceRole('depositfarmer', Math.max(150, (CREEP_LIFE_TIME - (50 * dist)) / nspots));
  }

  teamKraken() {
    const v = new RoomVisual(this.pos.roomName)
    const mask = [
      ' ####   ###   ####',
      '##  #  #####  #  ##',
      '#  ## ####### ##  #',
      '# ##  #######  ## #',
      '#    #########    #',
      '#### ######### ####',
      '   #   #####   #',
      '   #############',
      '##    # ### #    ##',
      '#  ####  #  ###   #',
      '# ##  #######  ## #',
      '###   #######   ###',
      '     ## # # ##',
      '#### #  # #  # ####',
      '#    #  # #  #    #',
      '##  ## ## ## ##  ##',
      ' ####  #   #  ####',
      '      ##   ##',
      '    ###     ###',
      '    #   # #   #',
      '    ##  # #  ##',
      '     #### ####'
    ]
    for (let y = 0; y < mask.length; y++) {
      const row = mask[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#') {
          v.circle(this.pos.x + x, this.pos.y + y);
        }
      }
    }
    return false
  }

  teamLogo() {
    logoDraw(this)
    if (!this.room!.controller!.my) {
      return claimer(this)
    }
    const nsites = this.room!.find(FIND_MY_CONSTRUCTION_SITES).length
    if (nsites > 0) {
      if (bootstrap(this, 1400)) return false
    }
    if (nsites > 3) return false
    if (_.size(Game.constructionSites) > 50) return false
    if (this.room!.controller!.level < 2) return false
    const dx = this.pos.x
    const dy = this.pos.y
    for (let xy of Memory.logo) {
      const p = this.room!.unpackPos(xy)
      const x = p.x
      const y = p.y
      const err = this.room!.createConstructionSite(dx + x, dy + y, STRUCTURE_WALL)
      if (err === OK) return false
      if (err === ERR_RCL_NOT_ENOUGH) return false
    }
    if (nsites === 0) {
      this.room!.controller!.unclaim()
      _.forEach(this.creeps, c => c.suicide() || true)
      this.setColor(COLOR_BLUE, COLOR_BROWN)
    }
    return false;
  }

  teamDeclaim() {
    if (!this.room!.controller) return false
    if (this.room!.controller!.my) return false
    if (!this.room!.controller!.owner) {
      this.setColor(COLOR_BLUE, COLOR_BROWN)
      return false;
    }
    if (this.room!.controller!.upgradeBlocked > 600) return false
    return this.paceRole('declaimer', 950)
  }

  teamWipe() {
    const ss = this.room!.find(FIND_HOSTILE_STRUCTURES)
    const target = this.pos.lookFor(LOOK_STRUCTURES)
    if (target.length < 1 && (!ss || _.all(ss, s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_CONTROLLER))) {
      this.setColor(COLOR_BLUE, COLOR_BROWN)
      return false;
    }
    return this.paceRole('bulldozer', 1500, {})
  }

  teamWho() {
    const r = this.what().toLowerCase()
    const pace = this.memory.pace || 1500
    this.dlog('new creep', r, pace)
    return this.paceRole(r, pace, {})
  }

  teamDone() {
    for (const creep of this.memory.creeps!) {
      const m = Memory.creeps[creep]
      if (m && m.egg) {
        this.log('Aborting Egg', creep, JSON.stringify(m))
        delete Memory.creeps[creep]
        return false
      }
    }

    if (this.memory.creeps!.length === 0) this.remove()
    return false
  }

  hasEgg(role: string) {
    return _.any(this.memory.creeps!,
      c => c.startsWith(role) && Memory.creeps[c] && Memory.creeps[c].egg)
  }

  exampleEgg(mem: any): boolean {
    return false;
  }

  // This spawns creeps no faster than a fixed rate.
  paceRole(role: string, rate: number, mem?: any) {
    if (rate < 150) {
      if (rate > 0) {
        this.log("BAD pace rate", role, rate);
      }
      return false;
    }

    const when = this.memory.when = this.memory.when || {}
    const wrole = when[role]
    if (!wrole || wrole + rate < Game.time) {
      if (this.hasEgg(role)) return false
      when[role] = Game.time + _.random(10)
      const fname = `${role}Egg` as "exampleEgg";
      return this[fname](mem)
    }
    return false
  }

  // An overlap of 1500 creates 2 creeps
  // An overlap of 0 starts spawning the replacement after the first dies.
  replaceRole(role: string, overlapTicks: number, mem?: any) {
    if (overlapTicks <= 0) return false;
    const total = this.countRole(role)
    const n = this.roleCreeps(role).length
    this.dlog(role, total, ':', n)
    if (total > n) return false

    const spawnLag = _.sum(this.roleCreeps(role), c => c.spawnTime);
    const ttl = _.sum(this.roleCreeps(role), c => c.ticksToLive || CREEP_LIFE_TIME) + _.random(10)
    this.dlog(role, ttl, spawnLag, overlapTicks);
    if (ttl >= overlapTicks + spawnLag) return false;
    this.log(role, ttl, overlapTicks, this.roleCreeps(role))

    const fname = `${role}Egg` as "exampleEgg";
    return this[fname](mem)
  }

  teamHub() {
    if (!this.room!.controller!.my) {
      return claimer(this)
    }
    if (!this.room!.storage) {
      return micro(this) ||
        defender(this) ||
        tower(this) ||
        hauler(this) ||
        bootstrap(this) ||
        metasrc(this, 'asrc') ||
        metasrc(this, 'bsrc') ||
        //harvester(this) ||
        false
    }
    return reboot(this) ||
      hauler(this) ||
      hub(this) ||
      defender(this) ||
      micro(this) ||
      metasrc(this, 'asrc') ||
      metasrc(this, 'bsrc') ||
      worker(this) ||
      shovel(this) ||
      controller(this) ||
      mineral(this) ||
      chemist(this) ||
      false
  }

  teamCore() {
    if (!this.room!.controller!.my) {
      return claimer(this)
    }
    if (!this.room!.storage) {
      return micro(this) ||
        defender(this) ||
        tower(this) ||
        bootstrap(this) ||
        harvester(this) ||
        false
    }
    return reboot(this) ||
      hauler(this) ||
      shunts(this) ||
      coresrc(this) ||
      auxsrc(this) ||
      defender(this) ||
      micro(this) ||
      worker(this) ||
      controller(this) ||
      upgrader(this) ||
      mineral(this) ||
      chemist(this) ||
      false
  }

  teamFarm() {
    return suppressMini(this) ||
      suppressGuard(this) ||
      suppressWolf(this) ||
      reserve(this) ||
      harvester(this) ||
      cart(this) ||
      false
  }

  teamRemote() {
    const spawned = suppressMini(this) ||
      suppressGuard(this) ||
      suppressWolf(this) ||
      suppressInvaderCore(this) ||
      reserve(this) ||
      harvester(this) ||
      paver(this) ||
      trucker(this) ||
      false
    if (spawned) return spawned

    this.makePathway(
      this.room!.find(FIND_SOURCES),
      (Game.storages as Structure[]).concat(Game.terminals as Structure[]));
    return false;
  }

  makePathway(srcs: Source[], dests: Structure[]) {
    let prevPaths: string[] = []
    for (const src of srcs) {
      let srcPath
      if (!this.memory[src.note as "examplePath"]) {
        const cb = (roomName: string) => {
          const r = Game.rooms[roomName]
          if (!r) return matrix.getMat(roomName) as unknown as CostMatrix;
          const mat = new PathFinder.CostMatrix()
          matrix.addStructures(mat, r)
          for (const s of r.find(FIND_SOURCES)) {
            matrix.setArea(mat, s.pos, 1, 0xf3)
          }
          if (r.controller) {
            matrix.setArea(mat, r.controller.pos, 1, 0xf3)
          }
          for (const n of prevPaths) {
            const prevPath = new Path(this.memory[n as "examplePath"]!)
            prevPath.setMat(mat, roomName)
          }
          return mat
        }
        const before = Game.cpu.getUsed()
        const targets = _.map(dests,
          s => ({
            range: 2,
            pos: s.pos
          }))
        const ret = PathFinder.search(src.pos, targets, {
          plainCost: 2,
          swampCost: 2,
          heuristicWeight: 1,
          roomCallback: cb
        })
        srcPath = Path.make(...ret.path)
        this.memory[src.note as "examplePath"] = srcPath.mem;
        this.log('BUILD PATH', Game.cpu.getUsed() - before, ret.incomplete, ret.path.length, ret.ops)
      } else {
        srcPath = new Path(this.memory[src.note as "examplePath"]!)
      }
      if (this.debug) {
        this.log('srcPath length', srcPath.length)
        srcPath.draw()
      }
      prevPaths.push(src.note)
      const i = Game.time % srcPath.length
      const ip = srcPath.get(i)!
      const r = Game.rooms[ip.roomName]
      if (!r) continue
      if (r.find(FIND_MY_CONSTRUCTION_SITES).length > 3) continue
      const structs = ip.lookFor(LOOK_STRUCTURES)
      let found = false
      for (const struct of structs) {
        found = found || struct.structureType === STRUCTURE_ROAD
        if (!found && struct.structureType !== STRUCTURE_RAMPART) {
          this.dlog('Need repath', found, src.note, struct, ip)
        }
      }
      if (!found) {
        const sites = ip.lookFor(LOOK_CONSTRUCTION_SITES)
        for (const site of sites) {
          found = found || site.structureType === STRUCTURE_ROAD
          if (!found && site.structureType !== STRUCTURE_RAMPART) {
            this.dlog('Need repath', src.note, site.structureType, ip)
          }
        }
        if (!found) {
          ip.createConstructionSite(STRUCTURE_ROAD)
        }
      }
    }
    return false
  }

}

lib.merge(Flag, TeamExtra)

function logoDraw(flag: TeamExtra) {
  const v = new RoomVisual(flag.pos.roomName)
  const dx = flag.pos.x
  const dy = flag.pos.y
  for (let xy of Memory.logo) {
    const x = Math.floor(xy / 100)
    const y = xy % 100
    v.circle(dx + x, dy + y)
  }
}

function gc(flag: TeamExtra) {
  flag.memory.creeps = flag.memory.creeps || []
  for (let cname of flag.memory.creeps) {
    if (!Memory.creeps[cname]) {
      return _.remove(flag.memory.creeps, c => c === cname)
    }
    if (!Game.creeps[cname] && !Memory.creeps[cname].egg) {
      delete Memory.creeps[cname]
      return _.remove(flag.memory.creeps, c => c === cname)
    }
  }
  return []
}

function auxsrc(flag: TeamExtra) {
  return flag.replaceRole('auxsrc', 1)
}

function bootstrap(flag: TeamExtra, n = 400) {
  return flag.paceRole('bootstrap', n)
}

function chemist(flag: TeamExtra) {
  const nlab = flag.room!.findStructs(STRUCTURE_LAB).length
  if (nlab < 1 || !flag.room!.terminal) return false
  return flag.replaceRole('chemist', 1)
}

function claimer(flag: TeamExtra) {
  return flag.paceRole('claimer', 1000)
}

function controller(flag: TeamExtra) {
  let cap = flag.room!.energyAvailable

  if (flag.room!.storage) {
    if (flag.room!.storage.store.energy < k.EnergyReserve) {
      cap = k.RCL2Energy
    }
  }

  if (flag.room!.controller!.level > 7) {
    cap = k.RCL2Energy;
  }

  return flag.replaceRole('ctrl', 28, {
    boosts: [RESOURCE_CATALYZED_GHODIUM_ACID],
    egg: { ecap: cap }
  })
}

function coresrc(flag: TeamExtra) {
  return flag.replaceRole('coresrc', 1)
}

function hauler(flag: TeamExtra) {
  const storage = flag.room!.storage
  const nlink = flag.room!.findStructs(STRUCTURE_LINK).length
  let nhauler = 150
  // One hauler cannot keep up with ctrl at RCL 4
  if (!storage || nlink < 2) {
    nhauler += 1500
  }
  return flag.replaceRole('hauler', nhauler)
}

function hub(flag: TeamExtra) {
  if (!flag.room!.storage) return false;
  if (!flag.room!.meta.getSpot('hub')) return false;
  return flag.replaceRole('hub', 1);
}

function harvester(flag: TeamExtra) {
  let n = 0
  if (flag.room!.find(FIND_SOURCES).length > 1) {
    n = 1450
  }
  return flag.paceRole('harvester', 1450) ||
    flag.paceRole('harvestaga', n)
}

function cart(flag: TeamExtra) {
  const n = flag.room!.find(FIND_SOURCES).length
  if (!n) return false

  return flag.paceRole('cart', 1400 / n)
}

function defender(flag: TeamExtra) {
  if (flag.room!.memory.tassaulters! < 5) return false

  return flag.replaceRole('defender', 1500 * flag.room!.assaulters.length)
}

function tower(flag: TeamExtra) {
  if (flag.room!.findStructs(STRUCTURE_TOWER).length) return false
  return flag.replaceRole('tower', 1)
}


function metasrc(flag: TeamExtra, asrc: string) {
  const meta = flag.room!.meta.getMeta(asrc);
  if (meta) {
    const src = Game.getObjectById<Source>(meta.targetid());
    const lvl = src?.effectLvl(PWR_REGEN_SOURCE) || 0;

    // overlap 50 to walk across room.
    // 50 is too much overlap.
    // Sampled 14 or so: b
    return flag.replaceRole(asrc, 50, { egg: { lvl } });
  }
  return false;
}


function micro(flag: TeamExtra) {
  if (flag.room!.memory.tassaulters! > 0) return false
  if (flag.room!.memory.tenemies! <= 0) return false

  return flag.paceRole('micro', 1500)
}

// function miner (flag: TeamExtra) {
//  const n = flag.room!.find(FIND_SOURCES).length
//  if (!n) return false

//  return flag.paceRole('miner', 1400 / n)
// }

function mineral(flag: TeamExtra) {
  const xtr = _.first(flag.room!.findStructs(STRUCTURE_EXTRACTOR))
  if (!xtr) return false

  if (!flag.room!.terminal) return false

  if (flag.room!.terminal.store.getFreeCapacity() < 50000) return false

  const p = flag.room!.getSpot('mineral');
  if (!p) return false;

  const structs = p.lookFor(LOOK_STRUCTURES) as StructureContainer[]
  const cont = _.find(structs, s => s.structureType === STRUCTURE_CONTAINER)
  if (!cont) {
    if (!flag.room!.find(FIND_MY_CONSTRUCTION_SITES).length) {
      p.createConstructionSite(STRUCTURE_CONTAINER)
    }
    return false
  }

  const m = _.first(flag.room!.find(FIND_MINERALS))
  if (!m.mineralAmount) return false

  if (flag.replaceRole('mineral', 150, { cont: cont.id })) return 'mineral'

  if (cont.store.getUsedCapacity() >= 1650) {
    return flag.replaceRole('minecart', 150, { cont: cont.id })
  }

  return false
}

function paver(flag: TeamExtra) {
  if (!flag.room!.find(FIND_MY_CONSTRUCTION_SITES).length) return false
  return flag.paceRole('paver', 1500)
}

function reboot(flag: TeamExtra) {
  const creeps = flag.room!.find(FIND_MY_CREEPS)
  if (_.some(creeps, c => c.role === 'hauler' || c.role === 'startup')) return false

  return flag.replaceRole('reboot', 1)
}

function reserve(flag: TeamExtra) {
  if (flag.room!.memory.thostiles) return false

  const controller = flag.room!.controller
  if (!controller) return false;

  const claimed = controller && controller.owner
  if (claimed) return false

  let n = 225;
  if (controller && controller.reservation && controller.reservation.username === 'deft-code') {
    if (controller.resTicks > 1000) return false
    if (controller.resTicks > 450) {
      n = 450
    }
  }

  return flag.paceRole('reserver', n, {})
}

function shovel(flag: TeamExtra) {
  if (!(flag.room?.controller?.level! >= 7)) return false;
  return flag.replaceRole('shovel', 1);
}

function shunts(flag: TeamExtra) {
  let ncore = 0
  let naux = 0
  if (flag.room!.storage && flag.room!.storage.my) {
    ncore = 1
  }

  if (flag.room!.terminal && flag.room!.terminal.my) {
    naux = 1
  }

  return flag.replaceRole('core', ncore) ||
    flag.replaceRole('aux', naux)
}

function startup(flag: TeamExtra) {
  const cap = flag.room!.energyCapacityAvailable
  let n = 9000
  if (cap >= 550) n = 6000
  if (cap >= 800) n = 3000

  return flag.replaceRole('startup', n)
}

function suppressGuard(flag: TeamExtra) {
  const t = flag.room!.memory.thostiles || 0
  if (t < 3) return false
  const rate = Math.max(1500 - t, 350)
  return flag.paceRole('guard', rate)
}

function suppressInvaderCore(flag: TeamExtra) {
  if (flag.room!.findStructs(STRUCTURE_INVADER_CORE).length > 0) {
    return flag.paceRole('wolf', 1500);
  }
  return false;
}

function suppressMicro(flag: TeamExtra) {
  const e = flag.room!.memory.tenemies
  if (!e) return false
  return flag.paceRole('micro', 1500)
}

function suppressMini(flag: TeamExtra) {
  const e = flag.room!.memory.tenemies
  if (!e) return false
  return flag.paceRole('mini', 1500)
}

function suppressWolf(flag: TeamExtra) {
  const t = flag.room!.memory.thostiles || 0
  if (t < 300) return false
  const rate = Math.max(1500 - t, 350)
  return flag.paceRole('wolf', rate)
}


function trucker(flag: TeamExtra) {
  let n = 0
  if (flag.room!.find(FIND_SOURCES).length > 1) {
    n = 1450
  }
  return flag.paceRole('trucker', 1450) ||
    flag.paceRole('truckaga', n)
}

function upgrader(flag: TeamExtra) {
  if (flag.room!.controller!.level >= 8) return false
  if (!flag.room!.storage) return false
  const e = flag.room!.storage.store.energy
  if (e < 200000) return false
  let n = 1
  if (e > 400000) n += 1500
  if (e > 800000) n += 1500
  return flag.replaceRole('upgrader', n)
}


const kMaxWorkerTTL = 4 * CREEP_LIFE_TIME;
const kWorkerLifeBuild = 40000;
function ctorWorker(room: Room) {
  const ctors = room.find(FIND_MY_CONSTRUCTION_SITES);
  if (!ctors.length) return 0;
  if (!room.storage && !room.terminal) return 1;
  // TODO let this go higher after after I can test it works well.
  // Ideally during a complete rebuild.
  let max = kMaxWorkerTTL;
  if (!room.terminal) {
    const newmax = room.storage!.store.energy / kWorkerLifeBuild * CREEP_LIFE_TIME;
    room.log("newmax", newmax);
    max = Math.max(Math.min(newmax, max), 1);
  }

  const need = _.sum(ctors, ctor => ctor.progressTotal - ctor.progress);
  if (need < kWorkerLifeBuild) return 1;
  return Math.min(max, Math.ceil(((need - kWorkerLifeBuild) / kWorkerLifeBuild) * CREEP_LIFE_TIME));
}


const kWorkerLifeRepair = 2000000;
function repairWorker(room: Room) {
  const wrs = _.sample(room.findStructs(STRUCTURE_WALL, STRUCTURE_RAMPART), 4);
  const amount = _.sum(wrs, wr => {
    const need = room.maxHits(wr) - wr.hits;
    if (need > 0) return need;
    return 0;
  });
  const repairTTL = Math.ceil((amount / kWorkerLifeRepair) * CREEP_LIFE_TIME);
  // if(repairTTL > 3000) {
  //   room.log("walls in need of repair", amount, wrs, wrs.map(wr => [wr.hits, room.maxHits(wr)]));
  // }
  let energyTTL = kMaxWorkerTTL;
  if (!room.terminal) {
    if (room.storage) {
      energyTTL = Math.ceil(room.storage.store.energy / (kWorkerLifeRepair / 100)) * CREEP_LIFE_TIME;
    } else {
      energyTTL = 1;
    }
  }
  return Math.min(kMaxWorkerTTL, repairTTL, energyTTL);

}

function workerOverlap(room: Room) {
  const siteTTL = ctorWorker(room);
  const repairTTL = repairWorker(room);
  const ttl = siteTTL + repairTTL;
  if (ttl > 0) {
    room.log(`nbuilders ${siteTTL}, nrepairers: ${repairTTL}`);
    return Math.min(kMaxWorkerTTL, ttl);
  }

  if (room.storage && room.storage.my && room.storage.store.energy > 500000) return 1
  if (_.any(room.findStructs(STRUCTURE_CONTAINER), s => s.hits < 10000)) return 1

  if (room.storage && room.storage.my && room.storage.store.energy < 160000) return 0

  return 0
}

function worker(flag: TeamExtra) {
  return flag.replaceRole('worker', workerOverlap(flag.room!))
}
