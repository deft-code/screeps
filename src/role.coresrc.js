const lib = require('lib');
const debug = require('debug');

module.exports = class CreepCore {
  roleAuxsrc() { return this.roleCoresrc(); }

  afterAuxsrc() { return this.afterCoresrc(); }

  afterCoresrc() {
    this.shieldsUp();
    this.idleNom();
    this.idleRepair() || this.idleBuild();
  }

  roleCoresrc() {
    const p = this.teamRoom.getSpot(this.role);
    if(!this.pos.isEqualTo(p)) {
      this.dlog('moving closer');
      return this.movePos(p);
    }

    let src = lib.lookup(this.memory.src);
    if(!src) {
      const spots = this.room.lookForAtRange(LOOK_SOURCES, p, 1, true);
      debug.log("finding sources", spots);
      src = _.sample(spots)[LOOK_SOURCES];
      this.memory.src = src.id;
    }

    if(!this.carryCapacity) {
      debug.log("simple harvest");
      return this.goHarvest(src, false);
    }

    let spawn = lib.lookup(this.memory.spawn);
    let store = lib.lookup(this.memory.store);
    if(!spawn || !store) {
      const looks = this.room.lookForAtRange(LOOK_STRUCTURES, p, 1, true);
      for(const look of looks) {
        const struct = look[LOOK_STRUCTURES];
        switch(struct.structureType) {
          case STRUCTURE_SPAWN:
            spawn = struct;
            break;
          case STRUCTURE_TERMINAL:
          case STRUCTURE_STORAGE:
          case STRUCTURE_CONTAINER:
            store = struct;
            break;
        }
      }
      this.memory.spawn = spawn.id;
      this.memory.store = store.id;
    }

    const what = this.goHarvest(src, false);
    if(what) {
      if(store.structureType !== STRUCTURE_CONTAINER && this.carryFree < this.info.harvest) {
        this.goTransfer(spawn, RESOURCE_ENERGY, false) ||
          this.goTransfer(store, RESOURCE_ENERGY, false);
      }
    } else if(this.carry.energy < 10) {
        this.goWithdraw(store, RESOURCE_ENERGY, false);
    }
    return what;
  }
}
