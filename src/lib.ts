// A standard collection of helper functions for screeps.
//
// The library has no external side effects; it does not modify any prototypes.
// However, most helpers are structured so they can be easily
// added to the existing Object prototypes (enhanceAll below).

type RoomOrName = string | Room

interface HasProto {
  readonly prototype: any
}

export function getset<T>(obj: any, path: string, def: T): T {
  const got = _.get(obj, path, def)
  _.set(obj, path, got)
  return got
}

// Game.getObjectById for an id that may be missing: null then, as for a
// stale id. Legacy roles keep target ids in memory fields that start empty.
export function byId<T extends _HasId>(id: Id<T> | string | undefined | null): T | null {
  if (!id) return null
  return Game.getObjectById(id as Id<T>)
}

export function bad_lookup(id: string): RoomObject | Room | null {
  if (!id) return null
  if (id.length === 24) {
    const ids: { [id: string]: RoomObject } = (Game as any)._ids = (Game as any)._ids || {}
    const s = Game.structures[id] || Game.constructionSites[id] || ids[id]
    if (s) return s

    const o = Game.getObjectById<any>(id as Id<any>) as RoomObject | null
    if (o) {
      ids[id] = o
      return o
    }
  }
  return Game.creeps[id] || Game.flags[id] || Game.rooms[id] || null
}

export function errStr(err: ScreepsReturnCode | number): string {
  return "errStr" + err;
}

export function getRoomName(roomOrName: RoomOrName): string {
  if (_.isString(roomOrName)) {
    return roomOrName
  }
  return roomOrName.name
}

export function isHighway(roomOrName: RoomOrName): boolean {
  return getRoomName(roomOrName).includes('0')
}

export function isSK(roomOrName: RoomOrName): boolean {
  const info = parseRoom(roomOrName)
  const mx = (info.E || info.W || 0) % 10
  const my = (info.N || info.S || 0) % 10
  return !(mx === 5 && my === 5) &&
    (mx >= 4 && mx <= 6) &&
    (my >= 4 && my <= 6)
}

export function parseRoom(roomOrName: RoomOrName): { [axis: string]: number } {
  const name = getRoomName(roomOrName)
  const parsed = /^([WE])([0-9]{1,2})([NS])([0-9]{1,2})$/.exec(name)!
  const ret: { [axis: string]: number } = {}
  ret[parsed[1]] = parseInt(parsed[2])
  ret[parsed[3]] = parseInt(parsed[4])
  return ret
}

export function pos2coord(pos: RoomPosition): { x: number, y: number } {
  const parsed = /^([WE])([0-9]{1,2})([NS])([0-9]{1,2})$/.exec(pos.roomName)!
  let x = pos.x + 50 * parseInt(parsed[2])
  if (parsed[1] === 'W') x = 50 - x

  let y = pos.y + 50 * parseInt(parsed[4])
  if (parsed[3] === 'N') y = 50 - y

  return { x: x, y: y }
}

// The JS original tested the unassigned locals x/y instead of coord.x/y
// (always the W/N branch); nothing calls it.
export function coord2Pos(coord: { x: number, y: number }): RoomPosition {
  let dx, dy
  let x, y
  let rx, ry

  if (coord.x >= 0) {
    dx = 'E'
    rx = Math.floor(coord.x / 50)
    x = coord.x % 50
  } else {
    dx = 'W'
    rx = Math.floor((-coord.x - 1) / 50)
    x = coord.x + 50 * (rx + 1)
  }

  if (coord.y >= 0) {
    dy = 'S'
    ry = Math.floor(coord.y / 50)
    y = coord.y % 50
  } else {
    dy = 'N'
    ry = Math.floor((-coord.y - 1) / 50)
    y = coord.y + 50 * (ry + 1)
  }

  return new RoomPosition(x, y, `${dx}${rx}${dy}${ry}`)
}

export function isMineral(mineral: string): boolean {
  return _.contains(RESOURCES_ALL, mineral as ResourceConstant) &&
    mineral !== RESOURCE_ENERGY &&
    mineral !== RESOURCE_POWER
}

export function isBoost(mineral: string): boolean {
  return isMineral(mineral) &&
    mineral.length > 1 &&
    mineral !== RESOURCE_HYDROXIDE &&
    mineral !== RESOURCE_UTRIUM_LEMERGITE &&
    mineral !== RESOURCE_ZYNTHIUM_KEANITE
}

export function fibonacci(n: number): number {
  if (n < 2) return n
  let p1 = 1
  let p2 = 0
  for (let i = 2; i < n; i++) {
    const tmp = p1
    p1 += p2
    p2 = tmp
  }
  return p1 + p2
}

// A read-only, non-enumerable getter on klass.prototype computed by func(this).
export function roProp(klass: HasProto, prop: string, func: (self: any) => any) {
  Object.defineProperty(klass.prototype, prop, {
    get: function () {
      // A work around for screeps-profiler prototype mangling.
      if (this === klass.prototype || this === undefined) return

      return func.call(this, this)
    },
    configurable: true,
    enumerable: false
  })
}

// A method that passes `this` as fn's first argument.
export function patch(fn: (self: any, ...args: any[]) => any) {
  return function (this: any, ...args: any[]) {
    return fn(this, ...args)
  }
}

export function enhance(klass: HasProto, prop: string, fn: (...args: any[]) => any) {
  if (fn.length === 1) {
    roProp(klass, prop, fn)
  } else if (fn.length > 1) {
    klass.prototype[prop] = patch(fn)
  }
}

// Copy extra's own prototype members (getters included) onto klass's
// prototype; the mixin mechanism of the 2017 code (later merges win).
export function merge(klass: HasProto, extra: HasProto) {
  const props = Object.getOwnPropertyNames(extra.prototype)
  for (let prop of props) {
    if (prop === 'constructor') continue

    const desc = Object.getOwnPropertyDescriptor(extra.prototype, prop)!
    Object.defineProperty(klass.prototype, prop, desc)
  }
}

// Returns a RoomPosition for obj or null if no position can be found.
export function getPos(obj: any): RoomPosition | null {
  if (obj instanceof RoomPosition) {
    return obj
  }
  if (obj.pos instanceof RoomPosition) {
    return obj.pos
  }
  for (let prop of _.values(obj)) {
    if (prop instanceof RoomPosition) {
      return prop
    }
  }
  return null
}

// Room enhancers

export function roomEnergyOpen(room: Room): number {
  return room.energyCapacityAvailable - room.energyAvailable
}

export function roomLookForAtRange<T extends keyof AllLookAtTypes>(room: Room, look: T, pos: RoomPosition, range: number, array: true) {
  return room.lookForAtArea(
    look, Math.max(0, pos.y - range), Math.max(0, pos.x - range),
    Math.min(49, pos.y + range), Math.min(49, pos.x + range), array)
}

// RoomPosition enhancers

const oppositeLookup = new Map<DirectionConstant, DirectionConstant>()
oppositeLookup.set(TOP, BOTTOM)
oppositeLookup.set(TOP_RIGHT, BOTTOM_LEFT)
oppositeLookup.set(RIGHT, LEFT)
oppositeLookup.set(BOTTOM_RIGHT, TOP_LEFT)
oppositeLookup.set(BOTTOM, TOP)
oppositeLookup.set(BOTTOM_LEFT, TOP_RIGHT)
oppositeLookup.set(LEFT, RIGHT)
oppositeLookup.set(TOP_LEFT, BOTTOM_RIGHT)

export function oppositeDir(dir: DirectionConstant): DirectionConstant {
  return oppositeLookup.get(dir)!
}

export function dirName(dir: DirectionConstant): string {
  switch (dir) {
    case TOP: return 'top'
    case TOP_RIGHT: return 'top_right'
    case RIGHT: return 'right'
    case BOTTOM_RIGHT: return 'bottom_right'
    case BOTTOM: return 'bottom'
    case BOTTOM_LEFT: return 'bottom_left'
    case LEFT: return 'left'
    case TOP_LEFT: return 'top_left'
    default: return 'bad_dir'
  }
}

export function roomposExit(pos: RoomPosition): boolean {
  return pos.x <= 0 || pos.y <= 0 || pos.x >= 49 || pos.y >= 49
}

// A RoomPosition from its memory form ({x, y, roomName}), false for anything else.
export function roomposFromMem(obj: any): RoomPosition | false {
  return _.isObject(obj) && new RoomPosition(obj.x, obj.y, obj.roomName)
}

export function roomposGetDirectionAway(pos: RoomPosition, dest: RoomPosition | _HasRoomPosition): DirectionConstant {
  return oppositeDir(pos.getDirectionTo(dest))
}

// NB: the 2017 original swaps the axes (TOP changes x); kept as written,
// nothing live calls it.
export function roomposAtDirection(pos: RoomPosition, dir: DirectionConstant): RoomPosition {
  let [x, y] = [pos.x, pos.y]
  switch (dir) {
    case TOP:
    case TOP_RIGHT:
    case TOP_LEFT:
      x--
      break
    case BOTTOM:
    case BOTTOM_RIGHT:
    case BOTTOM_LEFT:
      x++
      break
  }
  switch (dir) {
    case RIGHT:
    case TOP_RIGHT:
    case BOTTOM_RIGHT:
      y++
      break
    case LEFT:
    case TOP_LEFT:
    case BOTTOM_LEFT:
      y--
      break
  }

  return new RoomPosition(x, y, pos.roomName)
}

//
// Source
//

export function srcPositions(src: Source): RoomPosition[] {
  let spots = src.room.lookAtArea(
    src.pos.x - 1, src.pos.y - 1, src.pos.x + 1, src.pos.y + 1, true)
  return _(spots)
    .filter(spot => spot.type === 'terrain' && spot.terrain !== 'wall')
    .map(spot => new RoomPosition(spot.x, spot.y, src.room.name))
    .value()
}

//
// StructureTower
//

const lerp = (ratio: number, from: number, to: number) => from + (to - from) * ratio

const towerPower = (power: number, from: any, to: any): number => {
  const fpos = getPos(from)
  const tpos = getPos(to)
  if (!fpos || !tpos) {
    return ERR_INVALID_ARGS
  }
  const range = fpos.getRangeTo(tpos)
  if (!range) {
    return ERR_NOT_IN_RANGE
  }

  if (range <= TOWER_OPTIMAL_RANGE) {
    return power
  }

  const min = power - power * TOWER_FALLOFF
  if (range >= TOWER_FALLOFF_RANGE) {
    return min
  }

  const lerpTotal = TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE
  const lerpRange = range - TOWER_OPTIMAL_RANGE
  const ratio = lerpRange / lerpTotal

  return Math.floor(lerp(ratio, power, min))
}

export function towerAttackPower(tower: StructureTower, target: any): number {
  return towerPower(TOWER_POWER_ATTACK, tower, target)
}
export function towerHealPower(tower: StructureTower, target: any): number {
  return towerPower(TOWER_POWER_HEAL, tower, target)
}
export function towerRepairPower(tower: StructureTower, target: any): number {
  return towerPower(TOWER_POWER_REPAIR, tower, target)
}

// The helpers enhanceProto can install, by name (the JS original walked the
// module's exports).
const helpers: { [name: string]: (...args: any[]) => any } = {
  roomEnergyOpen, roomLookForAtRange,
  roomposExit, roomposFromMem, roomposGetDirectionAway, roomposAtDirection,
  towerAttackPower, towerHealPower, towerRepairPower,
}

export function enhanceProto(klass: HasProto, re: RegExp) {
  for (let fname in helpers) {
    const found = re.exec(fname)
    if (found) {
      const prop = _.camelCase(found[1])
      const fn = helpers[fname]
      enhance(klass, prop, fn)
    }
  }
}

export function enhancePosition() {
  enhanceProto(RoomPosition, /^roompos(.*)$/)
  ;(RoomPosition as any).FromMem = roomposFromMem
}

export function enhanceStructure() {
  enhanceProto(Structure, /^struct([A-Z].*)$/)
}

export function enhanceRoom() {
  enhanceProto(Room, /^room([A-Z].*)$/)
}

export function enhanceTower() {
  enhanceProto(StructureTower, /^tower(.*)/)
}

export function enhanceAll() {
  enhancePosition()
  enhanceRoom()
  enhanceStructure()
  enhanceTower()
}
