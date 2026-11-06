import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team melee hunter (also `micro`); job.wolf.ts and job.micro.ts
// replaced it.
@injecter(Creep)
export class CreepWolf extends CreepHeal {
  roleMicro () { return this.roleWolf() }
  afterMicro () { return this.afterWolf() }
  roleWolf () {
    return this.idleRetreat(TOUGH) ||
      this.taskTask() ||
      // this.moveRoom(this.team) ||
      this.taskWolf() ||
      this.movePeace(this.team)
  }

  afterWolf () {
    this.idleAttack()
    if (this.info.heal) {
      this.idleHeal()
    }
  }

  taskWolf () {
    const creep = this.pos.findClosestByRange(this.room.enemies)
    return this.taskAttack(creep) || this.taskAttackInvaderCore();
  }

  taskAttackInvaderCore() {
    const core = _.first(this.room.findStructs(STRUCTURE_INVADER_CORE));
    this.dlog("attacking", core);
    return this.taskAttack(core || null);
  }
}
