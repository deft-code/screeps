import * as debug from 'debug';

const kStuckCreep = 100
const kStuckRange = 2
const kMaxStall = 5

let gCache = {}

export function drawMat(mat, roomName) {
  const vis = new RoomVisual(roomName)
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const v = mat.get(x, y)
      if (v === 0xff) {
        vis.circle(x, y, { fill: 'red', opacity: 1 })
      } else if (v === 1) {
        vis.circle(x, y, { fill: 'white', opacity: 1 })
      } else if (v > 0) {
        if (v < 10) {
          vis.circle(x, y, { fill: 'green', opacity: 1 })
        } else {
          vis.circle(x, y, { fill: 'blue', opacity: 1 })
        }
      }
    }
  }
}

exports.draw = (roomName) => {
  exports.drawMat(exports.get(roomName), roomName)
}

exports.addStructures = function (mat, room) {
  for (const struct of room.find(FIND_STRUCTURES)) {
    const [x, y] = [struct.pos.x, struct.pos.y]
    switch (struct.structureType) {
      case STRUCTURE_RAMPART:
        if (!struct.my) {
          if (struct.isPublic) {
            debug.warn(room.name, "has public ramaparts", struct.isPublic)
          }
          mat.set(x, y, 0xff)
        }
        break

      case STRUCTURE_ROAD:
        mat.set(x, y, 1)
        break

      case STRUCTURE_CONTROLLER:
      case STRUCTURE_EXTRACTOR:
        // There is a wall underneath.
        break

      case STRUCTURE_KEEPER_LAIR:
        exports.setArea(mat, struct.pos, 3, 20)
        break

      default:
        if (struct.structureType !== STRUCTURE_CONTAINER) {
          mat.set(x, y, 0xff)
        }
        break
    }
  }
  for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
    const [x, y] = [site.pos.x, site.pos.y]
    switch (site.structureType) {
      case STRUCTURE_RAMPART:
      case STRUCTURE_ROAD:
      case STRUCTURE_CONTAINER:
        break
      default:
        mat.set(x, y, 0xff)
        break
    }
  }
}

const kNull = new PathFinder.CostMatrix()

export function getMat(roomName) {
  const entry = gCache[roomName]
  const room = Game.rooms[roomName]
  if (!entry) {
    if (!room) {
      // console.log(`Null Matrix ${roomName}`)
      return { _bits: kNull._bits }
    }
  } else {
    if (entry.t === Game.time || !room) {
      if (!room) debug.dlog(`Blind Matrix ${roomName}`);
      // return PathFinder.CostMatrix.deserialize(entry.mat)
      return { _bits: entry.mat }
    }
  }

  const mat = new PathFinder.CostMatrix()
  exports.addStructures(mat, room)
  addCreeps(mat, room)

  gCache[room.name] = {
    t: Game.time,
    mat: mat._bits
  }
  return { _bits: mat._bits }
}

exports.repath = (me) => (roomName) => {
  const mat = exports.get(roomName)
  if (roomName !== me.pos.roomName) return mat
  for (const creep of me.room.find(FIND_CREEPS)) {
    if (creep.pos.inRangeTo(creep, kStuckRange)) {
      mat.set(creep.pos.x, creep.pos.y, kStuckCreep)
    }
  }
  return mat
}

const calcStall = (room) => {
  const mem = room.memory.stalls || {}
  if (mem.t === Game.time) return
  const newMem = { t: Game.time }
  for (const creep of room.find(FIND_CREEPS)) {
    const prev = mem[creep.id]
    if (!prev || prev.x !== creep.pos.x || prev.y !== creep.pos.y) {
      newMem[creep.id] = {
        x: creep.pos.x,
        y: creep.pos.y,
        t: Game.time
      }
      continue
    }
    newMem[creep.id] = prev
  }
  room.memory.stalls = newMem
}

exports.getStallTicks = (creep) => {
  const mem = creep.room.memory.stalls
  if (!mem) return 0

  const cmem = mem[creep.id]
  if (!cmem) return 0

  return Game.time - cmem.t
}

exports.setArea = function (mat, pos, range, cost) {
  const t = Game.map.getRoomTerrain(pos.roomName)
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const [x, y] = [pos.x + dx, pos.y + dy]
      if (x < 0 || y < 0) continue
      if (x > 49 || y > 49) continue
      if (t.get(x, y) === TERRAIN_MASK_WALL) continue
      mat.set(x, y, cost)
    }
  }
}

const addCreeps = (mat, room) => {
  calcStall(room)
  for (const creep of room.find(FIND_CREEPS)) {
    const dt = exports.getStallTicks(creep)
    if (dt >= kMaxStall) {
      mat.set(creep.pos.x, creep.pos.y, kStuckCreep)
    }
    if (creep.my) continue

    if (creep.owner.username !== 'Source Keeper') continue

    const info = creep.info
    if (info.rangedAttack) {
      exports.setArea(mat, creep.pos, 3, 20)
    } else if (info.attack) {
      exports.setArea(mat, creep.pos, 1, 20)
    }
  }
}
