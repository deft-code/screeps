import * as debug from 'debug';
import { injecter } from 'roomobj';

// Egg factories of the flag-team era: a team flag lays an egg by writing
// Memory.creeps[name] with an `egg` block (team, body key, spawn strategy,
// priority) for spawnold.run to hatch. Dead with team.ts: missions lay
// eggs through Mission.layEgg and the SpawnDaemon.

declare global {
  interface FlagMemory {
    // Memory every egg of the flag inherits (makeEgg).
    over?: Partial<CreepMemory>
  }
  interface Flag {
    makeEgg(role: string, mem?: any): string
    localEgg(name: string, mem?: any): string
    closeEgg(name: string, mem?: any): string
    remoteEgg(name: string, mem?: any): string
    maxEgg(name: string, mem?: any): string
  }
}

let lastI = 0
function findName(role: string): string {
  let n = Game.ncreeps
  if (!n) n = _.size(Memory.creeps)

  const nn = n + 1

  for (let i = 0; i < nn; i++) {
    const ii = i + lastI % nn
    const name = role + ii
    if (!Memory.creeps[name]) {
      lastI = i
      return name
    }
  }
  debug.log('Failed to find creep name', role, n)
  return role + Game.time
}

@injecter(Flag)
class EggFlag extends Flag {
  makeEgg (role: string, mem?: any): string {
    const name = findName(role)
    const over = this.memory.over || {}
    Memory.creeps[name] = _.defaultsDeep({ egg: {} }, over, mem, {
      team: this.name,
      egg: {
        team: this.name,
        body: role,
        laid: Game.time,
      }
    })
    this.memory.creeps!.push(name)
    return name
  }

  localEgg (name: string, mem: any = {}): string {
    return this.makeEgg(name, _.defaultsDeep({}, mem, {
      egg: {
        spawn: 'local',
        priority: 5
      }
    }))
  }

  closeEgg (name: string, mem: any = {}): string {
    return this.makeEgg(name, _.defaultsDeep({}, mem, {
      egg: {
        spawn: 'close',
        priority: 15
      }
    }))
  }

  remoteEgg (name: string, mem: any = {}): string {
    return this.makeEgg(name, _.defaultsDeep({}, mem, {
      egg: {
        spawn: 'remote',
        priority: 10
      }
    }))
  }

  maxEgg (name: string, mem: any = {}): string {
    this.log("maxing", name);
    return this.makeEgg(name, _.defaultsDeep({}, mem, {
      egg: {
        spawn: 'max',
        priority: 9
      }
    }))
  }

  asrcEgg (mem?: any) {
    return this.localEgg('asrc', _.defaultsDeep({}, mem, { egg: { body: 'srcer' } }));
  }

  auxEgg () {
    return this.localEgg('aux', { egg: { body: 'shunt' } })
  }

  auxsrcEgg () {
    return this.localEgg('auxsrc', { egg: { body: 'coresrc' } })
  }

  bootstrapEgg () {
    return this.remoteEgg('bootstrap')
  }

  bsrcEgg (mem?: any) {
    return this.localEgg('bsrc', _.defaultsDeep({}, mem, { egg: { body: 'srcer' } }));
  }

  bulldozerEgg () {
    return this.closeEgg('bulldozer')
  }

  capEgg () {
    return this.localEgg('cap');
  }

  cartEgg (mem?: any) {
    return this.closeEgg('cart', mem)
  }

  chemistEgg () {
    return this.localEgg('chemist')
  }

  claimerEgg () {
    return this.closeEgg('claimer')
  }

  cleanerEgg () {
    return this.closeEgg('cleaner')
  }

  collectorEgg () {
    return this.closeEgg('collector')
  }

  coresrcEgg () {
    return this.localEgg('coresrc')
  }

  coreEgg () {
    return this.localEgg('core', { egg: { body: 'shunt' } })
  }

  ctrlEgg (mem?: any) {
    return this.localEgg('ctrl', mem)
  }

  declaimerEgg (mem?: any) {
    return this.maxEgg('declaimer', mem)
  }

  defenderEgg (mem?: any) {
    return this.localEgg('defender', mem)
  }

  depositfarmerEgg (mem?: any) {
    return this.maxEgg('depositfarmer', mem);
  }

  farmerEgg (mem?: any) {
    return this.closeEgg('farmer', mem)
  }

  guardEgg (mem?: any) {
    return this.closeEgg('guard', mem)
  }

  harvestagaEgg () {
    return this.closeEgg('harvestaga', {
      egg: { body: 'miner' }
    })
  }

  harvesterEgg () {
    return this.closeEgg('harvester', {
      egg: { body: 'miner' }
    })
  }

  haulerEgg (mem?: any) {
    return this.localEgg('hauler', _.defaultsDeep(
      {}, mem, {
      egg: { energy: Math.min(2500, this.room!.energyCapacityAvailable / 2) }
    }));
  }

  hubEgg () {
    return this.localEgg('hub', {
      egg: { body: 'hub' }
    });
  }

  masonEgg () {
    this.localEgg('mason', {
      boosts: [
        RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
        RESOURCE_CATALYZED_LEMERGIUM_ACID,
        RESOURCE_CATALYZED_KEANIUM_ACID]
    });
  }

  microEgg (mem?: any) {
    return this.closeEgg('micro', mem)
  }

  minecartEgg (mem?: any) {
    return this.localEgg('minecart', mem)
  }

  minerEgg (mem?: any) {
    return this.closeEgg('miner', mem)
  }

  mineralEgg (mem?: any) {
    return this.localEgg('mineral', _.defaultsDeep({}, mem, {
      boosts: [RESOURCE_CATALYZED_UTRIUM_ALKALIDE]
    }))
  }

  miniEgg (_mem?: any) {
    return this.closeEgg('mini', {
      egg: { body: 'mini' }
    })
  }

  paverEgg () {
    return this.closeEgg('paver', {
      egg: { body: 'worker' }
    })
  }

  ramboEgg (_mem?: any) {
    return this.maxEgg('rambo', {
      boosts: [
        RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
        RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
        RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
        RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]
    })
  }

  rebootEgg () {
    return this.localEgg('reboot')
  }

  reserverEgg (mem?: any) {
    return this.closeEgg('reserver', mem)
  }

  scoutEgg (mem?: any) {
    return this.closeEgg('scout', mem)
  }

  shovelEgg (_mem?: any) {
    return this.localEgg('shovel', {
      egg: { body: 'hub' }
    });
  }

  startupEgg () {
    return this.localEgg('startup')
  }

  towerEgg () {
    return this.remoteEgg('tower')
  }

  truckagaEgg (_mem?: any) {
    return this.closeEgg('truckaga', {
      egg: { body: 'collector' }
    })
  }

  truckerEgg (_mem?: any) {
    return this.closeEgg('trucker', {
      egg: { body: 'collector' }
    })
  }

  upgraderEgg () {
    return this.localEgg('upgrader', {
      egg: { body: 'worker' }
    })
  }

  wolfEgg () {
    return this.closeEgg('wolf')
  }

  workerEgg () {
    return this.localEgg('worker')
  }

  zombiefarmerEgg () {
    return this.closeEgg('zombiefarmer', {
      egg: { body: 'collector' }
    })
  }
}
