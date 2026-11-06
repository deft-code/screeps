import * as debug from 'debug';
import type { CreepExtra } from 'creep';

// Cost matrices of the flag-team era (team.ts): structures, stalled creeps
// and keeper reach per room, cached a tick. Dead: the Rewalker has its own
// matrices (docs/movement.md).

const kStuckCreep = 100
const kStuckRange = 2
const kMaxStall = 5

interface MatEntry {
  t: number
  mat: Uint8Array
}

interface StallMem {
  x: number
  y: number
  t: number
}

interface StallsMem {
  t: number
  [creepId: string]: StallMem | number
}

declare global {
  interface CostMatrix {
    // The engine's backing array (CostMatrix.serialize is the public form).
    _bits: Uint8Array
  }
  interface RoomMemory {
    // Where each creep in the room was last seen to move (calcStall).
    stalls?: StallsMem
  }
}

let gCache: { [roomName: string]: MatEntry } = {}

export function drawMat(mat: CostMatrix, roomName: string) {
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

export function draw(roomName: string) {
  drawMat(get(roomName), roomName)
}

export function addStructures(mat: CostMatrix, room: Room) {
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
        if (mat.get(x, y) !== 0xff) {
          // roads on constructedWalls are not tunnels!
          mat.set(x, y, 1);
        }
        break

      case STRUCTURE_CONTROLLER:
      case STRUCTURE_EXTRACTOR:
        // There is a wall underneath.
        break

      case STRUCTURE_KEEPER_LAIR:
        setArea(mat, struct.pos, 3, 20)
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

// A bare {_bits} stands in for a CostMatrix: PathFinder reads only that.
function bitsMatrix(bits: Uint8Array): CostMatrix {
  return { _bits: bits } as unknown as CostMatrix
}

// The room's matrix for this tick: structures and stalled creeps, blind
// rooms from the cache, unseen rooms empty.
export function getMat(roomName: string): CostMatrix {
  const entry = gCache[roomName]
  const room = Game.rooms[roomName]
  if (!entry) {
    if (!room) {
      // console.log(`Null Matrix ${roomName}`)
      return bitsMatrix(kNull._bits)
    }
  } else {
    if (entry.t === Game.time || !room) {
      if (!room) debug.dlog(`Blind Matrix ${roomName}`);
      // return PathFinder.CostMatrix.deserialize(entry.mat)
      return bitsMatrix(entry.mat)
    }
  }

  const mat = new PathFinder.CostMatrix()
  addStructures(mat, room)
  addCreeps(mat, room)

  gCache[room.name] = {
    t: Game.time,
    mat: mat._bits
  }
  return bitsMatrix(mat._bits)
}

// The JS original called an undefined `get`; getMat is what was meant.
export function get(roomName: string): CostMatrix {
  return getMat(roomName)
}

export function repath(me: Creep) {
  return (roomName: string) => {
    const mat = get(roomName)
    if (roomName !== me.pos.roomName) return mat
    for (const creep of me.room.find(FIND_CREEPS)) {
      if (creep.pos.inRangeTo(creep, kStuckRange)) {
        mat.set(creep.pos.x, creep.pos.y, kStuckCreep)
      }
    }
    return mat
  }
}

const calcStall = (room: Room) => {
  const mem: StallsMem = room.memory.stalls || { t: 0 }
  if (mem.t === Game.time) return
  const newMem: StallsMem = { t: Game.time }
  for (const creep of room.find(FIND_CREEPS)) {
    const prev = mem[creep.id] as StallMem | undefined
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

export function getStallTicks(creep: Creep): number {
  const mem = creep.room.memory.stalls
  if (!mem) return 0

  const cmem = mem[creep.id] as StallMem | undefined
  if (!cmem) return 0

  return Game.time - cmem.t
}

export function setArea(mat: CostMatrix, pos: RoomPosition, range: number, cost: number) {
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

const addCreeps = (mat: CostMatrix, room: Room) => {
  calcStall(room)
  for (const creep of room.find(FIND_CREEPS)) {
    const dt = getStallTicks(creep)
    if (dt >= kMaxStall) {
      mat.set(creep.pos.x, creep.pos.y, kStuckCreep)
    }
    if (creep.my) continue

    if (creep.owner.username !== 'Source Keeper') continue

    const info = (creep as CreepExtra).info
    if (info.rangedAttack) {
      setArea(mat, creep.pos, 3, 20)
    } else if (info.attack) {
      setArea(mat, creep.pos, 1, 20)
    }
  }
}
