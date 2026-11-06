import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Claims (or attacks) the team room's controller; job.claimer.ts lays it
// for Startup through the JobRole bridge.
@injecter(Creep)
export class CreepClaimer extends CreepHeal {
  roleClaimer () {
    const what = this.taskTask() || this.moveRoom(this.team) || this.moveNear(this.room.controller!)
    if (what) return what

    const ctrl = this.room.controller!
    if (ctrl.owner) {
      if (!ctrl.my) {
        const err = this.attackController(ctrl)
        if (err === OK) return ctrl.ticksToDowngrade
        this.dlog('attack error:', err)
      }
    } else {
      const err = this.claimController(this.teamRoom.controller!)
      this.dlog('claim error:', lib.errStr(err))
    }
    return false
  }

  afterClaimer () {}
}
