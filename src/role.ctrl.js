const lib = require('lib')

module.exports = class CreepCtrl {
  roleCtrl () {
    const what = this.moveSpot()
    if (what) return what

    this.goUpgradeController(this.teamRoom.controller, false)

    if (this.carry.energy < 2 * this.getActiveBodyparts(WORK)) {
      const struct = lib.lookup(this.memory.struct) ||
        _(this.room.lookForAtRange(LOOK_STRUCTURES, this.room.controller.pos, 4, true))
          .map(spot => spot[LOOK_STRUCTURES])
          .filter(s => s.structureType !== STRUCTURE_TOWER)
          .find(s => s.energy || (s.store && s.store.energy))
      if (struct) {
        this.memory.struct = struct.id
        if (!this.goWithdraw(struct, RESOURCE_ENERGY, false)) {
          delete this.memory.struct
        }
      }
    }
  }

  afterCtrl () {
    const p = this.room.getSpot(this.role)
    const r = Game.rooms[p.roomName]
    if (r.controller.level < 8) {
      this.structAtSpot(STRUCTURE_CONTAINER)
    }
  }
}
