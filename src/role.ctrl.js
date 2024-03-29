import { isStoreStruct } from 'guards';

module.exports = class CreepCtrl {
  roleCtrl() {
    const what = this.taskTask() || this.taskBoostOne() || this.moveSpot()
    if (what) return what

    this.goUpgradeController(this.teamRoom.controller, false)

    if (this.store.energy < 2 * this.getActiveBodyparts(WORK)) {
      const struct = Game.getObjectById(this.memory.struct) ||
        _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true))
          .map(spot => spot[LOOK_STRUCTURES])
          .filter(s => s.structureType !== STRUCTURE_TOWER && s.structureType !== STRUCTURE_EXTENSION)
          .find(s => isStoreStruct(s) && s.store.energy)
      if (struct) {
        this.memory.struct = struct.id
        this.dlog(JSON.stringify(this.memory))
        if (!this.goWithdraw(struct, RESOURCE_ENERGY, false)) {
          delete this.memory.struct
        }
      }
    }
  }

  afterCtrl() {
    const p = this.room.getSpot(this.role)
    if (!p) return
    const r = Game.rooms[p.roomName]
    if (r.controller.level < 8) {
      this.structAtSpot(STRUCTURE_CONTAINER)
    }
  }
}
