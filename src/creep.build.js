const lib = require('lib');

class CreepBuild {
  taskBuildOrdered() {
    return this.taskBuildStructs(STRUCTURE_ROAD) ||
        this.taskBuildStructs(STRUCTURE_TOWER) ||
        this.taskBuildStructs(STRUCTURE_CONTAINER, STRUCTURE_EXTENSION) ||
        this.taskBuildAny();
  }

  taskBuildAny() {
    const sites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
    return this.taskBuildSites(sites);
  }

  taskBuildStructs(...types) {
    const sites = _.filter(
        this.room.find(FIND_MY_CONSTRUCTION_SITES),
        site => _.contains(types, site.structureType));

    return this.taskBuildSites(sites);
  }

  taskBuildSites(sites) {
    return this.taskBuildNearSites(sites) || this.taskBuildClosestSites(sites);
  }

  taskBuildNearSites(sites) {
    const site = _(sites)
                     .filter(site => this.pos.inRangeTo(site, 3))
                     .sortBy(site => site.progressTotal - site.progress)
                     .first();
    return this.taskBuild(site);
  }

  taskBuildClosestSites(sites) {
    const site = this.pos.findClosestByRange(sites);
    return this.taskBuild(site);
  }

  taskBuild(site) {
    if (!this.carry.energy) return false;
    site = this.checkId('build', site);
    return this.goBuild(site);
  }

  goBuild(site, move=true) {
    const err = this.build(site);
    if (err === OK) {
      this.intents.melee = this.intents.range = site;
      return site.progressTotal - site.progress;
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.idleMoveRange(site);
    }
    return false;
  }
}

lib.merge(Creep, CreepBuild);
