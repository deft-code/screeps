import * as lib from 'lib'
import { run } from 'shed'

declare global {
  interface RoomMemory {
    //[what: string]: number
    role?: string
    spots?: {
      [name: string]: number
    }
    nstructs?: number
  }
}
class RoomExtras extends Room {
  get energyFreeAvailable() {
    return Math.max(0, this.energyCapacityAvailable - this.energyAvailable)
  }

  get wallMax() {
    if (!this.controller) return 0
    if (!this.controller.my) return 0

    switch (this.controller.level) {
      case 1: return 0
      case 2: return 100
      case 3:
      case 4: return 10000
      case 5: return 100000
      case 6: return 1000000
      case 7: return 6000000
      case 8: return 21000000
    }
    return 0
  }

  get role() {
    if (_.isString(this.memory.role)) {
      return this.memory.role;
    }
    if (this.controller && this.controller.my && this.find(FIND_MY_SPAWNS).length > 0) {
      return 'claimed';
    }
    return 'remote';
  }
}

lib.merge(Room, RoomExtras)

function stats(room: Room) {
  if (!Memory.stats.rooms) {
    Memory.stats.rooms = {}
  }
  if (!room.controller) return
  Memory.stats.rooms[room.name] = {
    rcl: room.controller.level,
    controllerProgress: room.controller.progress,
    controllerProgressTotal: room.controller.progressTotal
  }
}

Room.prototype.findStructs = function (...types) {
  if (!this.structsByType) {
    this.structsByType =
      _.groupBy(this.find(FIND_STRUCTURES), 'structureType')
  }
  return _.flatten(_.map(types, sType => this.structsByType[sType] || []))
}

Room.prototype.lookForAtRange = function (look, pos, range, array) {
  return this.lookForAtArea(
    look, Math.max(0, pos.y - range), Math.max(0, pos.x - range),
    Math.min(49, pos.y + range), Math.min(49, pos.x + range), array)
}

Room.prototype.addSpot = function (name: string, p: number | RoomPosition) {
  if (p instanceof RoomPosition) {
    p = this.packPos(p)
  }
  const spots = this.memory.spots = this.memory.spots || {}
  spots[name] = p as number
}

Room.prototype.getSpot = function (name: string) {
  const xy = (this.memory.spots || {})[name];
  if (xy) return this.unpackPos(xy);
  return this.meta.getSpot(name);
}

Room.prototype.drawSpots = function () {
  let i = 1
  let x = 25;
  let y = 25;
  if(this.controller) {
    x = this.controller.pos.x;
    y = this.controller.pos.y;
  }
  _.forEach(this.memory.spots!, (xy, name) => {
    const p = this.unpackPos(xy)
    this.visual.text(name!, x, y + i)
    this.visual.line(x, y + i, p.x, p.y, { lineStyle: 'dashed' })
    i++
  })
}

const kAllies = ['no one']

function ratchet(room: Room, what: string, up: boolean) {
  const twhat = `t${what}` as "tassaulters";
  const whattime = `${what}time` as "assaulterstime"

  if (!room.memory[whattime]) room.memory[whattime] = Game.time

  if (up) {
    if (!room.memory[twhat]) room.memory[twhat] = 0
    room.memory[twhat]!++
    room.memory[whattime] = Game.time
  } else {
    const delta = Game.time - room.memory[whattime]!
    if (delta > 10) {
      room.memory[twhat as "tassaulters"] = 0
    }
  }
}

Room.prototype.init = function () {
  const nstructs = this.find(FIND_STRUCTURES).length
  //this.deltaStructs = nstructs !== this.memory.nstructs
  this.memory.nstructs = nstructs

  this.allies = []
  this.enemies = []
  this.hostiles = []
  this.assaulters = []
  this.melees = []

  for (let c of this.find(FIND_CREEPS)) {
    if (!c.my) {
      if (_.contains(kAllies, c.owner.username)) {
        this.allies.push(c)
      } else {
        this.enemies.push(c)
        if (c.hostile) this.hostiles.push(c)
        if (c.assault) this.assaulters.push(c)
        if (c.melee) this.melees.push(c)
      }
    }
  }

  ratchet(this, 'hostiles', !!this.hostiles.length)
  ratchet(this, 'assaulters', !!this.assaulters.length)
  ratchet(this, 'enemies', !!this.enemies.length)
}

Room.prototype.run = function () {
  this.runTowers();
  run(this.find(FIND_MY_CREEPS), 1000, c => c.run());
  this.runDefense();
}

Room.prototype.after = function () {
  run(this.find(FIND_MY_CREEPS), 1000, c => c.after());
  stats(this);
}

Room.prototype.optional = function () {
  run(this.find(FIND_FLAGS), 4000, f => f.run());
  this.runKeeper();
  this.runLabs();
  this.runLinks();
  this.spawningRun();
}

Room.prototype.runDefense = function () {
  if (this.controller && this.controller.my) {
    if (this.assaulters.length) {
      const structs = this.findStructs(
        STRUCTURE_TOWER, STRUCTURE_SPAWN)
      if (_.find(structs, s => s.hits < s.hitsMax)) {
        const ret = this.controller.activateSafeMode()
        this.log('SAFE MODE!', ret)
        Game.notify(`SAFE MODE:${ret}! ${this}`, 30)
      }
    }
  }
}
