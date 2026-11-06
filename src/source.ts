import * as lib from 'lib';

// Harvest spots of a source or mineral: the walkable tiles beside it, each
// scored by its own walkable neighbours (a tile touching the source counts
// 1, any other 10), so bestSpot is the one leaving the most room for
// others. Cached on the heap per position; the room's memory can pin a
// best spot by note (bestSpots).

declare global {
  interface Source {
    spots: readonly RoomPosition[]
    bestSpot: RoomPosition
    calcSpots(): void
  }
  interface Mineral {
    note: string
    tick: SourceTick
    regenTTL: number
    spots: readonly RoomPosition[]
    bestSpot: RoomPosition
    calcSpots(): void
  }
  interface RoomMemory {
    // Pinned best harvest spot [x, y] by source/mineral note.
    bestSpots?: { [note: string]: [number, number] }
  }
}

type ScoredPos = RoomPosition & { score: number }

const gSpots = new Map<string, readonly RoomPosition[]>()
const gBestSpots = new Map<string, RoomPosition>()

class SourceExtra extends Source {
  get regenTTL() {
    if(this.tick.regen) return 300;
    return this.effectTTL(PWR_REGEN_SOURCE);
  }

  get spots () {
    const key = JSON.stringify(this.pos)
    if (!gSpots.has(key)) {
      this.calcSpots()
    }
    return gSpots.get(key)!
  }

  get bestSpot () {
    const key = JSON.stringify(this.pos)
    if (!gBestSpots.has(key)) {
      this.calcSpots()
    }
    return gBestSpots.get(key)!
  }

  calcSpots () {
    let best: ScoredPos | null = null
    let spots: RoomPosition[] = []
    const spotLooks = this.room.lookForAtRange(LOOK_TERRAIN, this.pos, 1, true)
    for (const spotLook of spotLooks) {
      const spotT = spotLook[LOOK_TERRAIN]
      if (spotT === 'wall') continue
      const spot = new RoomPosition(spotLook.x, spotLook.y, this.pos.roomName) as ScoredPos
      spot.score = 0
      const looks = this.room.lookForAtRange(LOOK_TERRAIN, spot, 1, true)
      for (let look of looks) {
        const [x, y] = [look.x, look.y]
        const t = look[LOOK_TERRAIN]
        if (t === 'wall') continue
        if (this.pos.isNearTo(x, y)) {
          spot.score += 1
        } else {
          spot.score += 10
        }
      }
      const fspot = Object.freeze(spot)
      if (!best || fspot.score >= best.score) {
        best = fspot
      }
      spots.push(fspot)
    }

    const key = JSON.stringify(this.pos)
    gSpots.set(key, Object.freeze(spots))

    const bests = this.room.memory.bestSpots = this.room.memory.bestSpots || {}
    const mbest = bests[this.note]
    if (mbest) {
      const pinned = new RoomPosition(mbest[0], mbest[1], this.room.name)
      gBestSpots.set(key, pinned)
      console.log('best from memory', key, pinned)
    } else {
      // A source walled in on every side has no spot; its own tile stands in.
      gBestSpots.set(key, best || this.pos)
    }
  }
}

lib.merge(Source, SourceExtra)
lib.merge(Mineral, SourceExtra)

class SrcNote extends Source {
  get note () {
    return `src${this.pos.x}${this.pos.y}`
  }
}
lib.merge(Source, SrcNote)

class MineralNote extends Mineral {
  get note () {
    return `mineral${this.pos.x}${this.pos.y}`
  }
}
lib.merge(Mineral, MineralNote)
