import * as lib from 'lib'
import { run } from 'shed'
import { balanceSplit } from 'struct.link';

declare global {
  interface RoomMemory {
    //[what: string]: number
    role?: string
    spots?: {
      [name: string]: number
    }
  }
}
class RoomExtras extends Room {
  get energyFreeAvailable() {
    return Math.max(0, this.energyCapacityAvailable - this.energyAvailable)
  }

  maxHits(struct: Structure<BuildableStructureConstant>): number{
    return this.strat.maxHits(struct.structureType, struct.pos.xy);
  }

  get wallMaxREMOVE() {
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
  
  toString() {
    return `<a href="/a/#!/room/${Game.shard.name}/${this.name}">${this.name}</a>`
  }
}

lib.merge(Room, RoomExtras)

Room.prototype.findStructs = function (...types: StructureConstant[]) {
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
  if (this.controller) {
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