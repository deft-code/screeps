import { CreepHarvest } from "creep.harvest"
import { TaskRet } from "Tasker";
import { injecter } from "roomobj";

declare global {
  interface CreepMemory {
    cont: Id<StructureContainer>
  }
}

@injecter(Creep)
export class RoleMineral extends CreepHarvest {
  roleMineral(): TaskRet {
    let cont = Game.getObjectById(this.memory.cont)
    if (!cont) {
      this.log('Missing cont')
      return false;
    }

    let what = this.taskTask() || this.taskBoostMineral();
    if (what) return what;

    if (this.movePos(cont)) return 'moving'

    if (cont.store.getFreeCapacity() < this.info.mineral) return false

    const mineral = _.first(this.room.find(FIND_MINERALS))
    const ret = this.harvest(mineral)
    if (ret === ERR_TIRED) return 'waiting'
    if (ret === OK) return 'mined'
    if (ret === ERR_NOT_ENOUGH_RESOURCES) return 'empty'

    this.log(ret)
    return false
  }
}
