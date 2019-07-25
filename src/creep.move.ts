import * as lib from 'lib';
import * as util from 'util';
import * as matrix from 'matrix';
import {isHostile} from 'routes';
import { injecter } from 'roomobj';
import { CreepRole } from 'creep.role';

type HasPos = { pos: RoomPosition };
type ObjPos = RoomPosition | HasPos;


declare global {
  interface Creep {
    travelTo(target: ObjPos, opt: any): ScreepsReturnCode;
  }
}

@injecter(Creep)
export class CreepMove extends CreepRole {
  moveDir(dir: DirectionConstant) {
    return this.moveHelper(this.move(dir), dir)
  }

  movePos(target: ObjPos, opts: any = {}) {
    opts = _.defaults(opts, { range: 0 })
    return this.moveTarget(target, opts)
  }

  moveNear(target: ObjPos, opts: any = {}) {
    opts = _.defaults(opts, { range: 1 })
    return this.moveTarget(target, opts)
  }

  moveRange(target: ObjPos, opts: any = {}) {
    opts = _.defaults(opts, { range: 3 })
    const what = this.moveTarget(target, opts)
    this.dlog(`moveRange ${what}`)
    return what
  }

  moveTarget(target: ObjPos, opts: { range: number }) {
    if (!target || this.pos.inRangeTo(target, opts.range)) return false

    const weight = this.weight
    const fatigue = this.info.fatigue!;
    this.dlog('moveTarget', weight, fatigue, target)

    const routeCB = (roomName: string) => {
      if (isHostile(roomName)) return 10
      return undefined
    }

    opts = _.defaults(opts, {
      ignoreRoads: fatigue > weight,
      // allowHostile: true,
      routeCallback: routeCB,
      roomCallback: matrix.getMat
    })
    return this.moveHelper(this.travelTo(target, opts), lib.getPos(target))
  }


  moveHelper(err: ScreepsReturnCode, intent: any) {
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

  movePeace(target: HasPos) {
    if (this.room.memory.tenemies) return false
    return this.moveRange(target)
  }

  moveBump(target: (HasPos & { id: string }) | null) {
    if (!target || !this.pos.isNearTo(target) || this.id === target.id) return false
    return this.moveDir(this.pos.getDirectionTo(target))
  }

  fleeHostiles() {
    if (!this.room.hostiles.length) return false

    if (this.hurts) return this.idleFlee(this.room.hostiles, 5)

    return this.idleFlee(this.room.hostiles, 3)
  }

  idleFlee(creeps: Creep[], range: number) {
    const room = this.room
    const callback = (roomName: string) => {
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
      this.pos, _.map(creeps, creep => ({ pos: creep.pos, range: range })), {
        flee: true,
        roomCallback: callback
      })

    const next = _.first(ret.path)
    if (!next) return false

    return this.moveDir(this.pos.getDirectionTo(next))
  }

  idleRetreat(...parts: BodyPartConstant[]) {
    if (this.hurts < 100) return false
    if (this.hits > this.hurts) {
      for (const part of parts) {
        if (!this.partsByType.get(part)) continue;
        if (this.activeByType.get(part)) return false;
      }
    }
    this.dlog('retreating', this.hits, this.hurts, parts)
    return this.moveRange(this.home.controller!)
  }

  actionHospital() {
    if (this.hurts > 100 || (this.hurts > 0 && this.hits < 100)) {
      return this.moveRange(this.home.controller!)
    }
    return false
  }

  moveRoom(obj: HasPos | null, opts = {range: 1}) {
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
    opts = _.defaults(opts, { range: range })
    return this.moveTarget(obj, opts)
  }

  taskMoveRoom(obj: RoomObject|null) {
    obj = this.checkId('move room', obj)
    return this.moveRoom(obj)
  }

  taskMoveFlag(flag: Flag | null, opts = {range: 1}) {
    flag = this.checkFlag('move flag', flag)
    return this.moveRoom(flag, opts)
  }

  moveSpot() {
    const where = this.memory.spot || this.role
    const p = this.teamRoom.getSpot(where)
    if (!p) return false;
    if (!this.pos.isEqualTo(p)) {
      this.dlog("moving to", p);
      return this.movePos(p)
    }
    return false
  }
}
