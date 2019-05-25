import * as lib from 'lib';

const packXY = (pos: RoomPosition) => pos.x * 100 + pos.y
const unpackY = (xy: number) => xy % 100
const unpackX = (xy: number) => Math.floor(xy / 100)
const unpackXY = (xy: number): [number, number] => [unpackX(xy), unpackY(xy)]

lib.roProp(RoomPosition, 'xy', packXY)

lib.roProp(RoomPosition, 'exit',
  (p: RoomPosition) => p.x <= 0 || p.y <= 0 || p.x >= 49 || p.y >= 49)

Room.prototype.packPos = function (pos) {
  return packXY(pos)
}

Room.prototype.unpackPos = function (xy) {
  return this.getPositionAt(unpackX(xy), unpackY(xy))!
}

type SegMem = [string, ...number[]];
export type PathMem = SegMem[];

declare global {
  interface FlagMemory {
    examplePath?: PathMem
  }
}

export class Path {
  _length?: number
  mem: PathMem
  constructor (mem: PathMem) {
    this.mem = mem
  }

  static make (...pos: RoomPosition[]) {
    const mem: PathMem = []
    let seg: SegMem = [pos[0].roomName]
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
      const xys = _.map(seg.slice(1) as number[], unpackXY);
      v.poly(xys, {
        stroke: 'red',
        lineStyle: 'dashed'
      })
    }
  }

  get (i: number) {
    for (const seg of this.mem) {
      const nxy = seg.length - 1
      if (i < nxy) {
        return new RoomPosition(unpackX(seg[i + 1] as number), unpackY(seg[i + 1] as number), seg[0])
      }
      i -= nxy
    }
    return null
  }

  setMat (mat: CostMatrix, roomName: string, val = 1) {
    for (const seg of this.mem) {
      if (seg[0] !== roomName) continue
      for (let i = 1; i < seg.length; i++) {
        const x = unpackX(seg[i] as number)
        const y = unpackY(seg[i] as number)
        mat.set(x, y, val)
      }
    }
  }
}
