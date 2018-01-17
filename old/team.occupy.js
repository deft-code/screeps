Flag.prototype.teamOccupy = function () {
  if (!this.room || !this.room.controller.my) {
    this.dlog('claim farm')
    if (!this.room || !this.room.claimable) {
      this.dlog('Scout the farm')
      return this.upkeepRole(1, {role: 'scout', body: 'scout'}, 4, this.closeSpawn(300))
    }
    return this.upkeepRole(1, {role: 'claimer', body: 'claim'}, 4, this.closeSpawn(650))
  }

  return this.teamSuppress() ||
      this.teamHarvest()
}
