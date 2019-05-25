import * as lib from 'lib';

const gSpots = new Map()
const gBestSpots = new Map()

class SourceExtra extends Source {
  get regenTTL() {
    if(this.tick.regen) return 300;
    return this.effectTTL(PWR_REGEN_SOURCE);
  }

  get spots () {
    const key = JSON.stringify(this.pos)
    if (!gSpots[key]) {
      this.calcSpots()
    }
    return gSpots[key]
  }

  get bestSpot () {
    const key = JSON.stringify(this.pos)
    if (!gBestSpots[key]) {
      this.calcSpots()
    }
    return gBestSpots[key]
  }

  calcSpots () {
    let best = {score: 0}
    let spots = []
    const spotLooks = this.room.lookForAtRange(LOOK_TERRAIN, this.pos, 1, true)
    for (const spotLook of spotLooks) {
      const spotT = spotLook[LOOK_TERRAIN]
      if (spotT === 'wall') continue
      const spot = new RoomPosition(spotLook.x, spotLook.y, this.pos.roomName)
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
      if (fspot.score >= best.score) {
        best = fspot
      }
      spots.push(fspot)
    }

    const key = JSON.stringify(this.pos)
    gSpots[key] = Object.freeze(spots)

    const bests = this.room.memory.bestSpots = this.room.memory.bestSpots || {}
    const mbest = bests[this.note]
    if (mbest) {
      gBestSpots[key] = new RoomPosition(mbest[0], mbest[1], this.room.name)
      console.log('best from memory', key, gBestSpots[key])
    } else {
      gBestSpots[key] = best
    }
  }
}

lib.merge(Source, SourceExtra)
lib.merge(Mineral, SourceExtra)

class SrcNote {
  get note () {
    return `src${this.pos.x}${this.pos.y}`
  }
}
lib.merge(Source, SrcNote)

class MineralNote {
  get note () {
    return `mineral${this.pos.x}${this.pos.y}`
  }
}
lib.merge(Mineral, MineralNote)
