import { isStoreStruct } from 'guards';

module.exports = class CreepCtrl {
  roleCtrl() {
    const what = this.taskTask() || this.taskBoostOne() || this.moveSpot()
    if (what) return what

    this.goUpgradeController(this.teamRoom.controller, false)

    if (this.store.energy < 2 * this.getActiveBodyparts(WORK)) {
      // Storage first when it is adjacent (so the ctrl container, and any
      // ctrlhauler feeding it, is only needed where the storage is not),
      // then the cached struct, then any other adjacent store.
      const near = _(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true))
        .map(spot => spot[LOOK_STRUCTURES])
        .filter(s => s.structureType !== STRUCTURE_TOWER && s.structureType !== STRUCTURE_EXTENSION)
        .filter(s => isStoreStruct(s) && s.store.energy)
      const cached = Game.getObjectById(this.memory.struct)
      const struct = near.find(s => s.structureType === STRUCTURE_STORAGE) ||
        (cached && cached.store && cached.store.energy && cached) ||
        near.first()
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
