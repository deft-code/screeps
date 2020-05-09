import { CreepHarvest } from "creep.harvest"
import { injecter } from "roomobj"
import { TaskRet } from "Tasker"

@injecter(Creep)
export class CreepBuild extends CreepHarvest {
  idleBuild() {
    if (this.intents.melee || this.intents.range) return false;
    const site = _(this.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3))
      .sortBy(site => site.progressTotal - site.progress)
      .first();
    return this.goBuild(site, false);
  }

  taskBuildOrdered() {
    return this.taskBuildStructs(STRUCTURE_ROAD) ||
      this.taskBuildStructs(STRUCTURE_TOWER) ||
      this.taskBuildStructs(STRUCTURE_SPAWN) ||
      this.taskBuildStructs(STRUCTURE_CONTAINER, STRUCTURE_EXTENSION) ||
      this.taskBuildStructs(STRUCTURE_TERMINAL, STRUCTURE_STORAGE) ||
      this.taskBuildAny();
  }

  taskBuildAny() {
    const sites = this.room.find(FIND_MY_CONSTRUCTION_SITES)
    return this.taskBuildSites(sites)
  }

  taskBuildStructs(...types: StructureConstant[]) {
    const sites = _.filter(
      this.room.find(FIND_MY_CONSTRUCTION_SITES),
      site => _.contains(types, site.structureType))

    return this.taskBuildSites(sites)
  }

  taskBuildSites(sites: ConstructionSite[]) {
    return this.taskBuildBestSites(_.filter(sites, s => this.pos.inRangeTo(s, 3))) ||
      this.taskBuildBestSites(sites)
  }

  taskBuildBestSites(sites: ConstructionSite[]) {
    const site = _.first(_.sortBy(sites, s => s.progressTotal - s.progress))
    return this.taskBuild(site)
  }

  taskBuildNearSites(sites: ConstructionSite[]) {
    const site = _(sites)
      .filter(site => this.pos.inRangeTo(site, 3))
      .sortBy(site => site.progressTotal - site.progress)
      .first()
    return this.taskBuild(site)
  }

  taskBuildClosestSites(sites: ConstructionSite[]) {
    const site = this.pos.findClosestByRange(sites)
    return this.taskBuild(site)
  }

  taskBuild(site: ConstructionSite | null) {
    if (!this.store.energy) return false;
    site = this.checkId('build', site);
    return this.goBuild(site);
  }

  goBuild(site: ConstructionSite | null, move = true): TaskRet {
    if(!site) return false;
    const err = this.build(site!);
    if (err === OK) {
      this.intents.melee = this.intents.range = site;
      return "building";
    }
    if (move && err === ERR_NOT_IN_RANGE) {
      return this.moveRange(site);
    }
    return false;
  }
}
