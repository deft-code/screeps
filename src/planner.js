const debug = require('debug')
const lib = require('lib')

module.exports = function runPlanner (flag) {
  switch (flag.secondaryColor) {
    case COLOR_ORANGE:
      const b = new BasePlan(flag)
      return b.run()
    case COLOR_WHITE:
      return planCommit(flag)
    case COLOR_GREEN:
      return drawKeeper(flag)
    default:
      return flag.temp()
  }
}

function drawKeeper (flag) {
  const room = flag.room
  const plans = room.keeper().memory.plans
  const stypes = _.keys(plans)
  for (let stype of stypes) {
    for (let xy of plans[stype]) {
      const p = room.unpackPos(xy)
      drawAt(room.visual, stype, p)
    }
  }
}

function drawAt (v, stype, p) {
  const found = p.lookFor(LOOK_STRUCTURES)
  for (let f of found) {
    if (f.structureType === stype) return
  }

  if (stype === STRUCTURE_ROAD) {
    v.circle(p.x, p.y)
  } else {
    let color = 'orange'
    if (p.lookFor(LOOK_CONSTRUCTION_SITES).length) {
      color = 'cornflowerblue'
    }
    v.circle(p.x, p.y, {radius: 0.3, fill: color})
    v.text(icon(stype), p.x, p.y)
  }
}

function planCommit (flag) {
  for (const spot of flag.memory.perm) {
    const p = flag.room.unpackPos(flag.memory.spots[spot])
    flag.room.addSpot(spot, p)
  }
  const k = flag.room.keeper()
  const stypes = _.keys(flag.memory.structs)
  for (const stype of stypes) {
    k.plan(stype, ...flag.memory.structs[stype])
  }
  flag.remove()
}

function icon (stype) {
  switch (stype) {
    case STRUCTURE_SPAWN: return '\u24e2'
    case STRUCTURE_TOWER: return '\u21f4'
    case STRUCTURE_LINK: return '\u22c4'
  }
  return stype[0]
}

class BasePlan {
  constructor (flag) {
    this.flag = flag
    if (this.memory.room !== flag.pos.roomName) {
      this.flag.memory = {
        room: flag.pos.roomName,
        perm: ['core', 'coresrc', 'aux', 'auxsrc', 'mineral', 'ctrl'],
        structs: {
          [STRUCTURE_EXTENSION]: [],
          [STRUCTURE_LAB]: [],
          [STRUCTURE_LINK]: [],
          [STRUCTURE_NUKER]: [],
          [STRUCTURE_OBSERVER]: [],
          [STRUCTURE_POWER_SPAWN]: [],
          [STRUCTURE_RAMPART]: [],
          [STRUCTURE_ROAD]: [],
          [STRUCTURE_SPAWN]: [],
          [STRUCTURE_STORAGE]: [],
          [STRUCTURE_TERMINAL]: [],
          [STRUCTURE_TOWER]: []
        },
        spots: {},
        paths: []
      }
    }
  }

  get room () {
    return this.flag.room
  }

  get memory () {
    return this.flag.memory
  }

  getSpot (name) {
    const xy = this.memory.spots[name]
    if (!xy) {
      const f = _.find(this.room.find(FIND_FLAGS),
        x => x.name === name)
      if (!f) return null

      this.memory.spots[name] = this.room.packPos(f.pos)
      return f.pos
    }
    return this.room.unpackPos(xy)
  }

  getMineral () {
    return _.first(this.room.find(FIND_MINERALS)).pos
  }

  drawSpots () {
    const names = _.keys(this.memory.spots)
    let y = this.flag.pos.y + 2
    const x = this.flag.pos.x
    for (let name of names) {
      const p = this.getSpot(name)
      this.room.visual.text(name, x, y)
      this.room.visual.line(x, y, p.x, p.y)
      y++
    }
    return true
  }

  commit () {
    this.flag.setColor(COLOR_ORANGE, COLOR_WHITE)
  }

  run () {
    return this.orderSrcs() &&
      this.centroid() &&
      this.drawSrcs() &&
      this.findShunt('core', this.srcs[0].pos) &&
      this.drawSpots() &&
      this.drawPlans() &&
      this.place('core', this.srcs[0].pos, STRUCTURE_SPAWN) &&
      this.place('core', this.srcs[0].pos, STRUCTURE_STORAGE) &&
      this.placeEdge('core', STRUCTURE_LINK) &&
      this.placeEdge('core', STRUCTURE_TOWER, 3) &&
      this.findShunt('aux', this.srcs[1].pos) &&
      this.place('aux', this.srcs[1].pos, STRUCTURE_SPAWN, 2) &&
      this.place('aux', this.srcs[1].pos, STRUCTURE_TERMINAL) &&
      this.placeEdge('aux', STRUCTURE_LINK, 2, true) &&
      this.placeEdge('aux', STRUCTURE_TOWER, 6) &&
      this.findSpot('ctrl', this.room.controller.pos, 1) &&
      this.placeEdge('ctrl', STRUCTURE_LINK, 3, true) &&
      this.findSpot('lab', this.getPos(STRUCTURE_TERMINAL), 3) &&
      this.convertShunt() &&
      this.placeLabs() &&
      this.findExtn() &&
      this.placeExtn() &&
      this.findMineral() &&
      this.placePath(this.getPos(STRUCTURE_TERMINAL), this.getSpot('mineral')) &&
      this.placePath(this.getSpot('lab'), this.getPos(STRUCTURE_TERMINAL)) &&
      this.placePathExtn() &&
      this.placePathSpawns(this.getSpot('mineral')) &&
      this.placePathSpawns(this.getSpot('core')) &&
      this.placePathSpawns(this.getSpot('coresrc')) &&
      this.placePathSpawns(this.getSpot('aux')) &&
      this.placePathSpawns(this.getSpot('auxsrc')) &&
      this.placePathSpawns(this.getSpot('ctrl')) &&
      this.compressRoads() &&
      true
  }

  getPos (stype) {
    const xy = _.first(this.memory.structs[stype])
    if (xy) return this.room.unpackPos(xy)

    const s = _.first(this.room.findStructs(stype))
    if (s) return s.pos

    debug.log(this, 'bad get pos', stype)
    return this.room.getPositionAt(25, 25)
  }

  orderSrcs () {
    if (this.memory.srcs) {
      this.srcs = _.map(this.memory.srcs, lib.lookup)
      return true
    }

    this.srcs = this.room.find(FIND_SOURCES)
    if (this.srcs.length !== 2) {
      debug.log('too few srcs')
    }
    this.srcs.sort((a, b) => a.pos.getRangeTo(this.room.controller) - b.pos.getRangeTo(this.room.controller))
    this.room.visual.line(this.flag.pos, this.srcs[0].pos, {color: 'red'})
    this.memory.srcs = _.map(this.srcs, 'id')
    return false
  }

  centroid () {
    if (this.getSpot('centroid')) return true

    const x = Math.floor(
      (this.srcs[1].pos.x + this.srcs[0].pos.x) / 2)
    const y = Math.floor(
      (this.srcs[1].pos.y + this.srcs[0].pos.y) / 2)

    this.memory.spots['centroid'] = this.room.packPos(this.room.getPositionAt(x, y))
    return false
  }

  drawSrcs () {
    this.room.visual.line(this.flag.pos, this.srcs[0].pos, {color: 'red'})
    return true
  }

  findShunt (name, from) {
    if (this.getSpot(name)) return true

    const ret = this.findPath(from, 2)
    if (ret.incomplete) {
      debug.log('Failed path', JSON.stringify(ret))
      return false
    }
    this.room.visual.poly(ret.path)
    const shunt = ret.path.pop()
    this.memory.spots[name] = this.room.packPos(shunt)
    this.room.visual.circle(shunt)

    const src = ret.path.shift()
    this.memory.spots[name + 'X'] = this.room.packPos(src)
    this.room.visual.circle(src)
    return false
  }

  convertShunt () {
    for (let spot of _.keys(this.memory.spots)) {
      if (_.last(spot) !== 'X') continue
      const s = spot.replace('X', 'src')
      this.memory.spots[s] = this.memory.spots[spot]
      delete this.memory.spots[spot]
    }
    return true
  }

  findSpot (name, from, range = 2) {
    if (this.getSpot(name)) return true

    const ret = this.findPath(from, range)
    if (ret.incomplete) {
      debug.log('Failed path', JSON.stringify(ret))
      return false
    }
    this.room.visual.poly(ret.path)
    const p = ret.path.pop()
    this.memory.spots[name] = this.room.packPos(p)
    this.room.visual.circle(p)
    return false
  }

  findPath (from, range) {
    const obs = [{
      pos: from,
      range: range + 1
    }]

    const circle = (range, color, x, y) =>
          this.room.visual.circle(x, y, {
            radius: range,
            opacity: 0.2,
            strokeWidth: 0.3,
            stroke: color,
            fill: 'transparent'
          })

    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        const t = Game.map.getTerrainAt(x, y, from.roomName)
        if (t === 'wall') {
          obs.push({
            pos: this.room.getPositionAt(x, y),
            range: range
          })
          circle(range, 'blue', x, y)
        }
      }
    }

    const exits = this.room.find(FIND_EXIT)
    for (let exit of exits) {
      obs.push({
        pos: exit,
        range: range + 4
      })
      circle(range + 4, 'red', exit.x, exit.y)
    }

    for (const stype of _.keys(this.memory.structs)) {
      for (let xy of this.memory.structs[stype]) {
        const p = this.room.unpackPos(xy)
        let r = range
        if (_.contains([STRUCTURE_TERMINAL, STRUCTURE_SPAWN, STRUCTURE_STORAGE], stype)) {
          r += 2
        };
        obs.push({
          pos: p,
          range: r
        })
        circle(r, 'orange', p.x, p.y)
      }
    }

    const rc = (name) => {
      if (name !== this.room.name) return false
      const mat = this.fleeObstacles()
      const x = from.x
      const y = from.y

      try {
        mat.set(x + 3, y + 3, 10 + mat.get(x + 3, y + 3))
        mat.set(x + 3, y - 3, 10 + mat.get(x + 3, y - 3))
        mat.set(x - 3, y - 3, 10 + mat.get(x - 3, y - 3))
        mat.set(x - 3, y + 3, 10 + mat.get(x - 3, y + 3))
      } catch (err) {
        debug.log('Implement Bounds checking', err)
      }
      return mat
    }

    return PathFinder.search(
      from, obs, {
        flee: true,
        plainCost: 1,
        swampCost: 1,
        roomCallback: rc
      })
  }

  fleeObstacles () {
    const mat = new PathFinder.CostMatrix()

    const c = this.getSpot('centroid')
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        const t = Game.map.getTerrainAt(x, y, this.room.name)
        if (t === 'wall') continue

        const p = this.room.getPositionAt(x, y)
        const d = p.getRangeTo(c)
        mat.set(x, y, 70 + 3 * d)
      }
    }

    return this.obstacles(mat)
  }

  obstacles (mat) {
    if (!mat) mat = new PathFinder.CostMatrix()

    const stypes = _.keys(this.memory.structs)
    for (let stype of stypes) {
      if (!_.contains(OBSTACLE_OBJECT_TYPES, stype)) continue

      for (let xy of this.memory.structs[stype]) {
        const pos = this.room.unpackPos(xy)
        mat.set(pos.x, pos.y, 0xff)
      }
    }

    for (let spot of _.keys(this.memory.spots)) {
      if (!_.contains(this.memory.perm, spot)) continue

      const xy = this.memory.spots[spot]
      const p = this.room.unpackPos(xy)
      mat.set(p.x, p.y, 0xff)
    }
    return mat
  }

  drawPlans () {
    const stypes = _.keys(this.memory.structs)
    for (let stype of stypes) {
      for (let xy of this.memory.structs[stype]) {
        const p = this.room.unpackPos(xy)
        if (stype === STRUCTURE_ROAD) {
          this.room.visual.circle(p.x, p.y)
        } else {
          this.room.visual.circle(p.x, p.y, {radius: 0.3, fill: 'orange'})
          this.room.visual.text(icon(stype), p.x, p.y)
        }
      }
    }
    return true
  }

  placeEdge (name, stype, num = 1, front = false) {
    const xys = this.memory.structs[stype] = this.memory.structs[stype] || []
    if (xys.length >= num) return true

    const from = this.getSpot(name)
    const p = from.findClosestByRange(FIND_EXIT)
    return this.place(name, p, stype, num, front)
  }

  place (name, dest, stype, num = 1, front = false) {
    const xys = this.memory.structs[stype] = this.memory.structs[stype] || []
    if (xys.length >= num) return true

    const rc = (r) => {
      console.log('roomCallback', r)
      return this.obstacles()
    }

    const from = this.getSpot(name)

    const ret = PathFinder.search(
      from, [{pos: dest, range: 1}], {
        plainCost: 1,
        swampCost: 1,
        roomCallback: rc
      })
    this.room.visual.poly(ret.path)
    if (front) {
      this.memory.structs[stype].unshift(this.room.packPos(ret.path[0]))
    } else {
      this.memory.structs[stype].push(this.room.packPos(ret.path[0]))
    }
    return false
  }

  extnCentroid () {
    const n = this.memory.structs[STRUCTURE_EXTENSION].length
    if (n === 0) {
      return this.getPos(STRUCTURE_STORAGE)
    }

    let tx = 0
    let ty = 0
    for (let xy of this.memory.structs[STRUCTURE_EXTENSION]) {
      const p = this.room.unpackPos(xy)
      tx += p.x
      ty += p.y
    }
    const x = Math.floor(tx / n)
    const y = Math.floor(ty / n)
    return this.room.getPositionAt(x, y)
  }

  findExtn () {
    const n = this.memory.structs[STRUCTURE_EXTENSION].length
    if (n >= 60) return true

    const s = this.extnCentroid()

    const e30 = `extn30_${n}`
    if (!this.getSpot(e30)) {
      return this.findSpot(e30, s, 4)
    }

    const e15 = `extn15_${n}`
    if (!this.getSpot(e15)) {
      return this.findSpot(e15, s, 3)
    }
    return true
  }

  placeExtn () {
    const n = this.memory.structs[STRUCTURE_EXTENSION].length
    if (n >= 60) return true

    const e30 = `extn30_${n}`
    const p30 = this.getSpot(e30)
    const e15 = `extn15_${n}`
    const p15 = this.getSpot(e15)
    const s = this.extnCentroid()
    const d30 = s.getRangeTo(p30)
    const d15 = s.getRangeTo(p15)

    // const extn5 = `
    //  ere
    //  rer
    //  ere`

    const extn15 = `
      reree
      erere
      reeer
      erere
      eerer`

    const extn30 = `
      eeree..
      ereree.
      reeeree
      ererere
      eereeer
      .eerere
      ..eeree`

    let w
    let t
    let p
    if (d30 - 2 <= d15 && n <= 30) {
      p = p30
      w = 7
      t = extn30
      delete this.memory.spots[e15]
    } else {
      p = p15
      w = 5
      t = extn15
      delete this.memory.spots[e30]
    }

    const px = p.x - Math.floor(w / 2)
    const py = p.y - Math.floor(w / 2)
    const cb = (c, x, y) => {
      let stype

      switch (c) {
        case 'e': stype = STRUCTURE_EXTENSION; break
        case 'r': stype = STRUCTURE_ROAD; break
        default: return
      }
      this.memory.structs[stype].push(this.room.packPos(this.room.getPositionAt(x + px, y + py)))
    }

    this.processTemplate(t, w, cb)
    return false
  }

  processTemplate (tmpl, mx, cb) {
    let x = 0
    let y = 0
    for (let c of tmpl) {
      if (c === ' ') continue
      if (c === '\n') continue
      cb(c, x, y)
      x++
      if (x >= mx) {
        x = 0
        y++
      }
    }
  }

  placeLabs () {
    this.memory.structs[STRUCTURE_LAB] = this.memory.structs[STRUCTURE_LAB] || []
    this.memory.structs[STRUCTURE_ROAD] = this.memory.structs[STRUCTURE_ROAD] || []

    if (this.memory.structs[STRUCTURE_LAB].length >= 10) {
      return true
    }

    const p = this.getSpot('lab')

    const lab = `
      rll.n
      lrllr
      llrlr
      .llrp
      orrs.`

    const px = p.x - 2
    const py = p.y - 2
    const cb = (c, x, y) => {
      let stype

      switch (c) {
        case 'l': stype = STRUCTURE_LAB; break
        case 'r': stype = STRUCTURE_ROAD; break
        case 's': stype = STRUCTURE_SPAWN; break
        case 'n': stype = STRUCTURE_NUKER; break
        case 'o': stype = STRUCTURE_OBSERVER; break
        case 'p': stype = STRUCTURE_POWER_SPAWN; break
        default: return
      }
      this.memory.structs[stype].push(this.room.packPos(this.room.getPositionAt(x + px, y + py)))
    }

    this.processTemplate(lab, 5, cb)
  }

  findMineral () {
    if (this.getSpot('mineral')) return true

    const rc = (name) => {
      if (name !== this.room.name) return false
      return this.obstacles()
    }
    const t = this.getPos(STRUCTURE_TERMINAL)
    const m = _.first(this.room.find(FIND_MINERALS)).pos
    const ret = PathFinder.search(t, [{pos: m, range: 1}], {
      roomCallback: rc
    })
    this.memory.spots['mineral'] = this.room.packPos(ret.path.pop())
    return false
  }

  placePathSpawns (dest) {
    for (let xy of this.memory.structs[STRUCTURE_SPAWN]) {
      const p = this.room.unpackPos(xy)
      if (!this.placePath(p, dest)) return false
    }
    return true
  }

  placePathExtn () {
    const s = this.getPos(STRUCTURE_STORAGE)
    for (const spot of _.keys(this.memory.spots)) {
      if (!_.startsWith(spot, 'extn')) continue
      const e = this.getSpot(spot)
      if (!this.placePath(e, s)) return false
    }
    return true
  }

  placePath (from, dest, range = 1) {
    const key = this.room.packPos(from) * 10000 + this.room.packPos(dest)
    if (_.contains(this.memory.paths, key)) return true

    const rc = (name) => {
      if (name !== this.room.name) return false
      const mat = this.obstacles()

      for (let xy of this.memory.structs[STRUCTURE_ROAD]) {
        const pos = this.room.unpackPos(xy)
        mat.set(pos.x, pos.y, 1)
      }
      return mat
    }

    const ret = PathFinder.search(
      from, [{pos: dest, range: range}], {
        plainCost: 2,
        swampCost: 2,
        roomCallback: rc,
        heuristicWeight: 1
      })

    this.memory.paths.push(key)
    this.room.visual.poly(ret.path)
    for (const p of ret.path) {
      this.memory.structs[STRUCTURE_ROAD].push(this.room.packPos(p))
    }
  }

  compressRoads () {
    this.memory.structs[STRUCTURE_ROAD] = _.unique(this.memory.structs[STRUCTURE_ROAD])
  }
}
