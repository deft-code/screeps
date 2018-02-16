module.exports = class CreepReserver {
  roleReserver () {
    return this.taskTask() || this.taskMoveFlag(this.team) ||
        this.taskReserve(this.team.room.controller)
  }
  afterRoadPooper () {
    if (Game.map.getTerrainAt(this.pos) !== 'swamp') return
    if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length) return
    if (_.size(Game.constructionSites) > 50) return
    this.pos.createConstructionSite(STRUCTURE_ROAD)
  }

  afterReserver () {
    this.afterRoadPooper()
  }
}
