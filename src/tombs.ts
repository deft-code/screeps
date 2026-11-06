import { extender } from 'roomobj';

declare global {
  interface Tombstone {
    note: string
    xy: number
  }
}

@extender
class TombsExtra extends Tombstone {
  get note () {
    return 'tomb' + this.pos.xy;
  }

  get xy () {
    return this.room!.packPos(this.pos)
  }
}
