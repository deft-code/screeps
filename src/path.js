
const lib = require('lib')

const packXY = (pos) => pos.x * 100 + pos.y
const unpackY = (xy) => xy % 100
const unpackX = (xy) => Math.floor(xy / 100)

RoomPosition.unpack = (packed) => {
  const [xy, ref] = packed
  return new RoomPosition(
    unpackX(xy),
    unpackY(xy),
    exports.roomDeref(ref))
}

RoomPosition.prototype.pack = function () {
  return [exports.roomRef(this.roomName), packXY(this)]
}

Room.prototype.packPos = function (pos) {
  return packXY(pos)
}

Room.prototype.unpackPos = function (xy) {
  return this.getPositionAt(unpackX(xy), unpackY(xy))
}

const gRefs = {}
exports.roomRef = (name) => {
  const id = gRefs[name]
  if (id) return id

  for (const i in Memory.roomRefs) {
    gRefs[Memory.roomRefs[i]] = i + 1
  }
  return gRefs[name] || 0
}

exports.roomDeref = (id) => {
  if (id && id >= Memory.roomRefs.length) return null
  return Memory.roomRefs[id - 1]
}

// exports.mkPath = function (...pos) {
//  const ret = [pos.length]
//  let seg = pos[0].pack()
//  for (let i = 1; i < pos; i++) {
//    if (exports.roomRef(p.roomName) !== seg[0]) {
//      ret.push(seg)
//      seg = p.pack()
//    } else {
//      seg.push(packXY(p))
//    }
//  }
//  ret.push(seg)
//  return ret
// }

exports.getPos = (path, i) => {
  if (i >= path[0]) return null

  for (let r = 1; r < path.length; r++) {
    const seg = path[r]
    const n = seg.length - 1
    if (i >= n) {
      i -= n
      continue
    }
    const x = seg[i * 2 + 1]
    const y = seg[i * 2 + 2]
    const room = exports.roomDeref(seg[0])
    return new RoomPosition(x, y, room)
  }
}

// exports.iter = function(path) {
//  for(let r = 1; r<path.length; r++) {
//    const seg = path[r];
//    const room = exports.roomDeref(seg[0]);
//    for(let i = 1; i<seg.length; i++) {
//      yield new RoomPosition(
//        unpackX(seg[i]),
//        unpackY(seg[i]),
//        room);
//    }
//  }
// };

// const kMaxStall = 7
// const kStuckCreep = 0xfe
// const kStuckRange = 2

// const gCache = {}

exports.isHostile = (roomOrName) => {
  const name = lib.getRoomName(roomOrName)
  switch (name) {
    case 'W87S89':
    case 'W83S84':
    case 'W83S85':
    case 'W83S86':
      return true
  }
  return false
}

exports.serializePath = (startPos, path) => {
  let serializedPath = ''
  let lastPosition = startPos
  for (let position of path) {
    if (position.roomName === lastPosition.roomName) {
      serializedPath += lastPosition.getDirectionTo(position)
    }
    lastPosition = position
  }
  return serializedPath
}

exports.consumePath = (creep, path) => {
  if (!path.length) return ERR_INVALID_ARGS

  if (exports.getStallTicks(creep) === 0) {
    path = path.substr(1)
  }

  if (!path.length) return ERR_INVALID_ARGS
  const dir = path[0]

  return creep.move(dir)
}

exports.routeTo = (fromRoom, destRoom) => {
  const from = lib.getRoomName(fromRoom)
  const dest = lib.getRoomName(destRoom)
  const route = Game.map.findRoute(from, dest, {
    routeCallback: (roomName) => {
      if (lib.isHighway(roomName)) return 1
      if (exports.isHostile(roomName)) return 10
      return 2.5
    }})
  return _.map(route, entry => entry.room)
}

exports.positionAtDirection = (origin, direction) => {
  let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1]
  let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1]
  return new RoomPosition(origin.x + offsetX[direction], origin.y + offsetY[direction], origin.roomName)
}

// exports.get = (roomName) => {
//  const entry = gCache[roomName]
//  const room = Game.rooms[roomName]
//  if (!entry) {
//    if (!room) return new PathFinder.CostMatrix()
//  } else {
//    if (entry.t === Game.time || !room) {
//      return entry.mat
//    }
//  }

//  const mat = new PathFinder.CostMatrix()
//  addStructures(mat, room)
//  addCreeps(mat, room)

//  gCache[room.name] = {
//    t: Game.time,
//    mat: mat
//  }
//  return mat
// }
