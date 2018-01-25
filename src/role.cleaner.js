module.exports = class RoleCleaner {
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
      c => c.storeFree)
    if (cont) {
      return this.taskTransfer(cont, RESOURCE_ENERGY)
    }

    const e = _(this.room.find(FIND_DROPPED_RESOURCES))
      .filter(e => e.resourceType === RESOURCE_ENERGY)
      .max(e => e.amount)

    if (e) {
      return this.movePos(e) ||
        this.taskDrop()
    }

    return this.taskDrop()
  }

  afterCleaner () {
  }
}
