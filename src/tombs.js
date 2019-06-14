import * as lib from 'lib';
import * as util from 'util';

class TombsExtra {
  get note () {
    return util.structNote('tomb', this.pos)
  }

  get xy () {
    return this.room.packPos(this.pos)
  }

  get storeTotal () {
    return _.sum(this.store)
  }

  get storeFree () {
    return Math.max(0, this.storeCapacity - this.storeTotal)
  }
}

lib.merge(Tombstone, TombsExtra)
