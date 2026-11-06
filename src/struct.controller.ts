import { extender } from 'roomobj';

// resTicks / reservable are declared on StructureController in types.d.ts.
@extender
class ExtraController extends StructureController {
  get resTicks () {
    const res = this.reservation
    if (!res) return 0
    return res.ticksToEnd
  }

  get reservable () {
    return !this.owner &&
        (!this.reservation || this.reservation.username === 'deft-code')
  }
}
