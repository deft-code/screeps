const Role = require('role')
const spawners = require('spawners')
const k = require('constants')

module.exports = class Ctrl extends Role {
  static egg (flag) {
    return this.makeEgg(flag, 10)
  }

  static spawn (name) {
    return new CtrlSpawner(name)
  }

  run () {
    const what = this.taskTask() || this.taskBoostOne() || this.moveSpot()
    if (what) return what

    this.goUpgradeController(this.teamRoom.controller, false)

    if (this.carry.energy < 2 * this.getActiveBodyparts(WORK)) {
      const struct = Game.getObjectById(this.memory.struct) ||
        _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true))
          .map(spot => spot[LOOK_STRUCTURES])
          .filter(s => s.structureType !== STRUCTURE_TOWER && s.structureType !== STRUCTURE_EXTENSION)
          .find(s => s.energy || (s.store && s.store.energy))
      if (struct) {
        this.memory.struct = struct.id
        this.dlog(JSON.stringify(this.memory))
        if (!this.goWithdraw(struct, RESOURCE_ENERGY, false)) {
          delete this.memory.struct
        }
      }
    }
  }

  after () {
    const p = this.room.getSpot(this.role.role)
    const r = Game.rooms[p.roomName]
    if (r.controller.level < 8) {
      this.structAtSpot(STRUCTURE_CONTAINER)
    }
  }
}

class CtrlSpawner extends spawners.LocalSpawner {
  constructor (name) {
    super(name)
    this.extra = name
  }

  findSpawn () {
    const r = this.teamRoom
    if (!r) return null

    if (r.controller.level > 7) {
      return _.find(this.spawns, s => s.room.energyAvailable >= 2050)
    }

    if (r.controller.level > 6) {
      return _.find(this.spawns, s => s.room.energyAvailable >= 4200)
    }

    return this.fullSpawn()
  }

  body () {
    const r = this.teamRoom()
    if (!r) return null

    if (r.storage.energy < 150000) {
      return [MOVE, WORK, CARRY]
    }

    if (r.controller > 7 && this.energyAvailable >= 2050) {
      return [
        MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY]
    }

    if (this.energyAvailable >= 2050) {
      return [
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,

        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,

        CARRY, CARRY, CARRY, CARRY, CARRY]
    }

    const base = [CARRY]
    if (this.energyAvailable > k.RCL4Energy) {
      base.push(CARRY)
    }
    return this.bodyDef({
      move: 2,
      per: [WORK],
      base
    })
  }
}
