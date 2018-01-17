const lib = require('lib')

class ExtraController {
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

lib.merge(StructureController, ExtraController)
