import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team tower drainer: heals at the team flag, retreats home hurt; no
// job spawns it.
@injecter(Creep)
export class CreepDrain extends CreepHeal {
  roleDrain () {
    if (this.hurts) {
      if (this.room.name === this.team.pos.roomName ||
        this.pos.exit) {
        return this.moveRoom(this.home.controller || null, {ignoreCreeps: false})
      }
    }
    return this.taskHealRoom() || this.moveNear(this.team)
  }

  afterDrain () {
    this.idleHeal()
  }
}
