// A standard collection of helper functions for screeps.
//
// The library has no external side effects; it does not modify any prototypes.
// However, most helpers are structured so they can be easily
// added to the exsiting Object prototypes;

exports.getset = (obj, path, def) => {
  const got = _.get(obj, path, def)
  _.set(obj, path, got)
  return got
}

exports.bad_lookup = (id) => {
  if (!id) return null
  if (id.length === 24) {
    const ids = Game._ids = Game._ids || {}
    const s = Game.structures[id] || Game.constructionSites[id] || ids[id]
    if (s) return s

    const o = Game.getObjectById(id)
    if (o) {
      Game._ids[id] = o
      return o
    }
  }
  return Game.creeps[id] || Game.flags[id] || Game.rooms[id] || null
}

exports.errStr = (err) => {
  return "errStr" + err;
}

exports.getRoomName = (roomOrName) => {
  if (_.isString(roomOrName)) {
    return roomOrName
  }
  return roomOrName.name
}

exports.isHighway = (roomOrName) =>
  exports.getRoomName(exports.getRoomName(roomOrName)).includes('0')

exports.isSK = (roomOrName) => {
  const info = exports.parseRoom(roomOrName)
  const mx = (info.E || info.W || 0) % 10
  const my = (info.N || info.S || 0) % 10
  return !(mx === 5 && my === 5) &&
    (mx >= 4 && mx <= 6) &&
    (my >= 4 && my <= 6)
}

exports.parseRoom = (roomOrName) => {
  const name = exports.getRoomName(roomOrName)
  const parsed = /^([WE])([0-9]{1,2})([NS])([0-9]{1,2})$/.exec(name)
  const ret = {}
  ret[parsed[1]] = parseInt(parsed[2])
  ret[parsed[3]] = parseInt(parsed[4])
  return ret
}

exports.pos2coord = (pos) => {
  const parsed = /^([WE])([0-9]{1,2})([NS])([0-9]{1,2})$/.exec(pos.roomName)
  let x = pos.x + 50 * parseInt(parsed[2])
  if (parsed[1] === 'W') x = 50 - x

  let y = pos.y + 50 * parseInt(parsed[4])
  if (parsed[3] === 'N') y = 50 - y

  return {x: x, y: y}
}

exports.coord2Pos = (coord) => {
  let dx, dy
  let x, y
  let rx, ry

  if (x >= 0) {
    dx = 'E'
    rx = Math.floor(coord.x / 50)
    x = coord.x % 50
  } else {
    dx = 'W'
    rx = Math.floor((-coord.x - 1) / 50)
    x = coord.x + 50 * (rx + 1)
  }

  if (y >= 0) {
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

exports.isMineral = (mineral) =>
  _.contains(RESOURCES_ALL, mineral) &&
    mineral !== RESOURCE_ENERGY &&
    mineral !== RESOURCE_POWER

exports.isBoost = (mineral) =>
  exports.isMineral(mineral) &&
    mineral.length > 1 &&
    mineral !== RESOURCE_HYDROXIDE &&
    mineral !== RESOURCE_UTRIUM_LEMERGITE &&
    mineral !== RESOURCE_ZYNTHIUM_KEANITE

exports.fibonacci = (n) => {
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

exports.roProp = (klass, prop, func) => {
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

exports.patch = (fn) => function (...args) {
  return fn(this, ...args)
}

exports.enhance = (klass, prop, fn) => {
  if (fn.length === 1) {
    exports.roProp(klass, prop, fn)
  } else if (fn.length > 1) {
    klass.prototype[prop] = exports.patch(fn)
  }
}

exports.merge = (klass, extra) => {
  const props = Object.getOwnPropertyNames(extra.prototype)
  for (let prop of props) {
    if (prop === 'constructor') continue

    const desc = Object.getOwnPropertyDescriptor(extra.prototype, prop)
    Object.defineProperty(klass.prototype, prop, desc)
  }
}

// Returns a RoomPosition for obj or null if no position can be found.
exports.getPos = (obj) => {
  if (obj instanceof RoomPosition) {
    return obj
  }
  if (obj.pos instanceof RoomPosition) {
    return obj.pos
  }
  for (let prop of obj) {
    if (prop instanceof RoomPosition) {
      return prop
    }
  }
  return null
}

// Room enhancers

exports.roomEnergyOpen = (room) =>
    room.energyCapacityAvailable - room.energyAvailable

exports.roomLookForAtRange = (room, look, pos, range, array) =>
    room.lookForAtArea(
        look, Math.max(0, pos.y - range), Math.max(0, pos.x - range),
        Math.min(49, pos.y + range), Math.min(49, pos.x + range), array)

// RoomPosition enhancers

const oppositeLookup = new Map()
oppositeLookup.set(TOP, BOTTOM)
oppositeLookup.set(TOP_RIGHT, BOTTOM_LEFT)
oppositeLookup.set(RIGHT, LEFT)
oppositeLookup.set(BOTTOM_RIGHT, TOP_LEFT)
oppositeLookup.set(BOTTOM, TOP)
oppositeLookup.set(BOTTOM_LEFT, TOP_RIGHT)
oppositeLookup.set(LEFT, RIGHT)
oppositeLookup.set(TOP_LEFT, BOTTOM_RIGHT)

exports.oppositeDir = function (dir) {
  return oppositeLookup.get(dir)
}

exports.dirName = function (dir) {
  switch (dir) {
    case TOP: return 'top'
    case TOP_RIGHT: return 'top_right'
    case RIGHT: return 'right'
    case BOTTOM_RIGHT: return 'bottom_right'
    case BOTTOM: return 'bottom'
    case BOTTOM_LEFT: return 'bottom_left'
    case LEFT: return 'left'
    case TOP_LEFT: return 'top_left'
  }
  return 'bad_dir'
}

exports.roomposExit = (pos) =>
    pos.x <= 0 || pos.y <= 0 || pos.x >= 49 || pos.y >= 49

exports.roomposFromMem = (obj) => _.isObject(obj) && new RoomPosition(obj.x, obj.y, obj.roomName)

exports.roomposGetDirectionAway = (pos, dest) =>
    exports.oppositeDir(pos.getDirectionTo(dest))

exports.roomposAtDirection = (pos, dir) => {
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

exports.srcPositions = (src) => {
  let spots = src.room.lookAtArea(
      src.pos.x - 1, src.pos.y - 1, src.pos.x + 1, src.pos.y + 1, true)
  return _(spots)
      .filter(spot => spot.type === 'terrain' && spot.terrain !== 'wall')
      .map(spot => new RoomPosition(spot.x, spot.y, src.room.name))
      .value()
}

//
// Structure
//

exports.structMine = (struct) => struct && struct.my && struct.isActive()

// Total amount of stored resources.
exports.structStoreTotal = (struct) => _.sum(struct.store)

// Available storeing capacity.
exports.structStoreFree = (struct) =>
    Math.max(0, struct.storeCapacity - exports.structStoreTotal(struct))

// Available energy capacity.
exports.structEnergyFree = (struct) => Math.max(0, struct.energyCapacity - struct.energy)

exports.structObstacle = (struct) =>
    _.contains(OBSTACLE_OBJECT_TYPES, struct.structureType)

exports.structHurts = exports.creepHurts

//
// StructureTower
//

const lerp = (ratio, from, to) => from + (to - from) * ratio

const towerPower = (power, from, to) => {
  const fpos = exports.getPos(from)
  const tpos = exports.getPos(to)
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

exports.towerAttackPower = (tower, target) =>
    towerPower(TOWER_POWER_ATTACK, tower, target)
exports.towerHealPower = (tower, target) =>
    towerPower(TOWER_POWER_HEAL, tower, target)
exports.towerRepairPower = (tower, target) =>
    towerPower(TOWER_POWER_REPAIR, tower, target)

exports.enhanceProto = (klass, re) => {
  for (let fname in exports) {
    const found = re.exec(fname)
    if (found) {
      const prop = _.camelCase(found[1])
      const fn = exports[fname]
      exports.enhance(klass, prop, fn)
    }
  }
}

exports.enhanceCreep = () =>
    exports.enhanceProto(Creep, /^creep(.*)$/, exports)

exports.enhancePosition = () => {
  exports.enhanceProto(RoomPosition, /^roompos(.*)$/, exports)
  RoomPosition.FromMem = exports.roomposFromMem
}

exports.enhanceStructure = () =>
    exports.enhanceProto(Structure, /^struct([A-Z].*)$/, exports)

exports.enhanceRoom = () =>
    exports.enhanceProto(Room, /^room([A-Z].*)$/, exports)

exports.enhanceTower = () =>
    exports.enhanceProto(StructureTower, /^tower(.*)/, exports)

exports.enhanceAll = () => {
  exports.enhanceCreep()
  exports.enhancePosition()
  exports.enhanceRoom()
  exports.enhanceStructure()
  exports.enhanceTower()
}
