const lib = require('lib')

const packXY = (pos) => pos.x * 100 + pos.y
const unpackY = (xy) => xy % 100
const unpackX = (xy) => Math.floor(xy / 100)
const unpackXY = (xy) => [unpackX(xy), unpackY(xy)]

lib.roProp(RoomPosition, 'xy', packXY)

lib.roProp(RoomPosition, 'exit',
  p => p.x <= 0 || p.y <= 0 || p.x >= 49 || p.y >= 49)

Room.prototype.packPos = function (pos) {
  return packXY(pos)
}

Room.prototype.unpackPos = function (xy) {
  return this.getPositionAt(unpackX(xy), unpackY(xy))
}

module.exports = class Path {
  constructor (mem) {
    this.mem = mem
  }

  static make (...pos) {
    const mem = []
    let seg = [pos[0].roomName]
    for (const p of pos) {
      if (p.roomName !== seg[0]) {
        mem.push(seg)
        seg = [p.roomName]
      }
      seg.push(p.xy)
    }
    mem.push(seg)
    return new this(mem)
  }

  // [Symbol.iterator] () {
  //  for(const seg of this.mem) {
  //    const name = seg[0]
  //    for(let i = 1; i<seg.length; i++) {
  //      const x = unpackX(seg[i])
  //      const y = unpackY(seg[i])
  //      yeild new RoomPosition(x, y, name)
  //    }
  //  }
  // }

  toJSON () {
    return this.mem
  }

  get length () {
    if (!this._length) {
      this._length = _.sum(this.mem, seg => seg.length - 1)
    }
    return this._length
  }

  draw () {
    for (const seg of this.mem) {
      const v = new RoomVisual(seg[0])
      const xys = _.map(seg.slice(1), unpackXY)
      v.poly(xys, {
        stroke: 'red',
        lineStyle: 'dashed'
      })
    }
  }

  get (i) {
    for (const seg of this.mem) {
      const nxy = seg.length - 1
      if (i < nxy) {
        return new RoomPosition(unpackX(seg[i + 1]), unpackY(seg[i + 1]), seg[0])
      }
      i -= nxy
    }
    return null
  }

  setMat (mat, roomName, val = 1) {
    for (const seg of this.mem) {
      if (seg[0] !== roomName) continue
      for (let i = 1; i < seg.length; i++) {
        const x = unpackX(seg[i])
        const y = unpackY(seg[i])
        mat.set(x, y, val)
      }
    }
  }
}
