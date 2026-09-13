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

  // The ctrl container is planned by Meta_ctrl (metastruct.ts) since Sept
  // 2026; it used to be built here with structAtSpot.
}
