import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team scout that signs controllers and stomps hostile sites;
// job.scout.ts replaced it.
@injecter(Creep)
export class CreepScout extends CreepHeal {
  roleScout () {
    const what = this.taskTask() || this.goSign()
    if (what) return what

    if (this.atTeam) {
      const creep = this.pos.findClosestByRange(this.room.hostiles)
      if (creep) {
        if (this.pos.inRangeTo(creep, 4)) {
          this.dlog('Scout flee')
          return this.idleFlee(this.room.hostiles, 6)
        } else if (!this.pos.inRangeTo(creep, 10)) {
          return this.moveRange(creep, {range: 10})
        }
      }
    }
    this.dlog('Scout move')
    return this.moveRoom(this.team) ||
      this.taskStompAll() ||
      this.moveRange(this.team)
  }

  goSign () {
    const ctrl = this.room.controller
    if (!ctrl) return false
    const want = signs[this.room.name]
    if (want === undefined) return false
    let sign = false
    if (want.length) {
      sign = !ctrl.sign ||
        ctrl.sign.text !== want
    } else {
      sign = !!ctrl.sign
    }
    if (sign) {
      const err = this.signController(ctrl, want)
      if (err === ERR_NOT_IN_RANGE) {
        return this.moveNear(ctrl)
      }
      if (err !== OK) {
        this.log('Failed to sign controller:', want)
      }
      return 'signing'
    }
    return false
  }
}

// MMO rooms of 2018-19 (docs/known-issues.md).
const signs: { [roomName: string]: string } = {
  W18N18: 'Zombie Farm',
  W19N18: 'Zombie Farm',
  W21N18: 'RIP Ricochet1k',
  W22N12: 'Strongmint Was Here',
  W22N19: 'The Pit',
  W23N17: "You weren't using it",
  W23N18: 'Here lies Loena',
  W24N17: 'Fortress of Solitude',
  W24N18: 'Remote Harvestation',
  W26N18: 'Remote Harvestation',
  W27N19: 'The Lowest Bar in the World',
  W28N18: 'The Last Lupus',
  W29N21: 'RIP Nossarian',
  W33N19: 'Western Frontier',
  W34N19: 'RIP Charles Dankwin',
  W35N18: 'RIP explosion33'
}
