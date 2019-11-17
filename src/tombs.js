import * as lib from 'lib';
import { extender } from 'roomobj';

@extender
class TombsExtra extends Tombstone {
  get note () {
    return 'tomb' + this.pos.xy;
  }

  get xy () {
    return this.room.packPos(this.pos)
  }
}
