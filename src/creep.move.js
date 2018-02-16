const lib = require('lib')
const util = require('util')
const matrix = require('matrix')
const routes = require('routes')

module.exports = class CreepMove {
  moveDir (dir) {
    return this.moveHelper(this.move(dir), dir)
  }

  movePos (target, opts = {}) {
    opts = _.defaults(opts, {range: 0})
    return this.moveTarget(target, opts)
  }

  moveNear (target, opts = {}) {
    opts = _.defaults(opts, {range: 1})
    return this.moveTarget(target, opts)
  }

  moveRange (target, opts = {}) {
    opts = _.defaults(opts, {range: 3})
    const what = this.moveTarget(target, opts)
    this.dlog(`moveRange ${what}`)
    return what
  }

  moveTarget (target, opts = {}) {
    if (!target || this.pos.inRangeTo(target, opts.range)) return false

    const weight = this.weight
    const fatigue = this.info.fatigue
    this.dlog('moveTarget', weight, fatigue, target)

    const routeCB = (roomName) => {
      if (routes.isHostile(roomName)) return 10
      return undefined
    }

    opts = _.defaults(opts, {
      ignoreRoads: fatigue > weight,
      // allowHostile: true,
      routeCallback: routeCB,
      roomCallback: matrix.get
    })
    return this.moveHelper(this.travelTo(target, opts), lib.getPos(target))
  }

  moveHelper (err, intent) {
    switch (err) {
      case ERR_TIRED:
      case ERR_BUSY:
        if (this.debug) this.say(util.errString(err))
        // fallthrough
      case OK:
        this.intents.move = intent
        return `move ${intent}`
    }
    this.dlog('Move Error!', err, intent)
    return false
  }

  movePeace (target) {
    if (this.room.memory.tenemies) return false
    return this.moveRange(target)
  }

  moveBump (target) {
    if (!target || !this.pos.isNearTo(target)) return false
    this.moveDir(this.pos.getDirectionTo(target))
  }

  fleeHostiles () {
    if (!this.room.hostiles.length) return false

    if (this.hurts) return this.idleFlee(this.room.hostiles, 5)

    return this.idleFlee(this.room.hostiles, 3)
  }

  idleFlee (creeps, range) {
    const room = this.room
    const callback = (roomName) => {
      if (roomName !== room.name) {
        console.log('Unexpected room', roomName)
        return false
      }
      const mat = new PathFinder.CostMatrix()
      for (let struct of room.find(FIND_STRUCTURES)) {
        const p = struct.pos
        if (struct.structureType === STRUCTURE_ROAD) {
          mat.set(p.x, p.y, 1)
        } else if (struct.obstacle) {
          mat.set(p.x, p.y, 255)
        }
      }
      for (let pos of room.find(FIND_EXIT)) {
        mat.set(pos.x, pos.y, 6)
      }
      for (let creep of room.find(FIND_CREEPS)) {
        if (creep.name === this.name) continue
        mat.set(creep.pos.x, creep.pos.y, 20)
      }
      return mat
    }
    const ret = PathFinder.search(
        this.pos, _.map(creeps, creep => ({pos: creep.pos, range: range})), {
          flee: true,
          roomCallback: callback
        })

    const next = _.first(ret.path)
    if (!next) return false

    return this.moveDir(this.pos.getDirectionTo(next))
  }

  idleAway (creep) {
    if (!creep) return false
    return this.moveDir(this.pos.getDirectionAway(creep))
  }

  idleRetreat (part) {
    if (!this.hurts) return false
    if (this.hits >= this.hurts) {
      if (!this.partsByType[part]) return false
      if (this.activeByType[part]) return false
    }
    this.dlog('retreating')
    return this.moveRange(this.home.controller)
  }

  actionHospital () {
    if (this.hurts > 100 || (this.hurts > 0 && this.hits < 100)) {
      return this.moveRange(this.home.controller)
    }
    return false
  }

  moveRoom (obj, opts = {}) {
    if (!obj) return false
    const x = this.pos.x
    const y = this.pos.y
    if (obj.pos.roomName === this.room.name) {
      if (x === 0) {
        this.moveDir(RIGHT)
      } else if (x === 49) {
        this.moveDir(LEFT)
      } else if (y === 0) {
        this.moveDir(BOTTOM)
      } else if (y === 49) {
        this.moveDir(TOP)
      }
      this.dlog('moveRoom done')
      return false
    }

    const ox = obj.pos.x
    const oy = obj.pos.y
    const range = Math.max(1, Math.min(ox, oy, 49 - ox, 49 - oy) - 1)
    this.dlog('moveRoom', range, obj.pos.roomName, this.room)
    opts = _.defaults(opts, {range: range})
    return this.moveTarget(obj, opts)
  }

  taskMoveRoom (obj) {
    obj = this.checkId('move room', obj)
    return this.moveRoom(obj)
  }

  taskMoveFlag (flag, opts = {}) {
    flag = this.checkFlag('move flag', flag)
    return this.moveRoom(flag, opts)
  }
}
