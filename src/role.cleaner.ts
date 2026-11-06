import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team dismantler that pools the loot; no job spawns it.
@injecter(Creep)
export class RoleCleaner extends CreepHeal {
  roleCleaner () {
    return this.taskTask() ||
      this.moveRoom(this.team) ||
      this.taskDismantleAny() ||
      this.taskRaze(STRUCTURE_WALL) ||
      this.taskUnloot()
  }

  taskUnloot () {
    const cont = _.find(
      this.room.findStructs(STRUCTURE_CONTAINER),
      c => c.store.getFreeCapacity())
    if (cont) {
      return this.taskTransfer(cont, RESOURCE_ENERGY)
    }

    const e = _(this.room.find(FIND_DROPPED_RESOURCES))
      .filter(e => e.resourceType === RESOURCE_ENERGY)
      .max(e => e.amount)

    if (e) {
      return this.movePos(e) ||
        this.taskDrop(null)
    }

    return this.taskDrop(null)
  }

  afterCleaner () {
  }
}
