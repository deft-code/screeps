Creep.prototype.taskBuildOrdered = function() {
  return this.taskBuildStructs(STRUCTURE_ROAD) ||
      this.taskBuildStructs(STRUCTURE_TOWER) ||
      this.taskBuildStructs(STRUCTURE_CONTAINER, STRUCTURE_EXTENSION) ||
      this.taskBuildAny();
};

Creep.prototype.taskBuildAny = function() {
  if (!this.teamRoom) return false;

  const sites = this.teamRoom.find(FIND_MY_CONSTRUCTION_SITES);
  return this.taskBuildSites(sites);
};

Creep.prototype.taskBuildStructs = function(...types) {
  if (!this.teamRoom) return false;

  const sites = _.find(
      this.teamRoom.find(FIND_MY_CONSTRUCTION_SITES),
      site => _.any(types, t => site.structureType === t));

  return this.taskBuildSites(sites);
};

Creep.prototype.taskBuildSites = function(sites) {
  return this.taskBuildNearSites(sites) || this.taskBuildClosestSites(sites);
};

Creep.prototype.taskBuildNearSites = function(sites) {
  const site = _(sites)
                   .filter(site => this.pos.inRangeTo(site, 3))
                   .sortBy(site => site.progressTotal - site.progress)
                   .first();
  return this.taskBuild(site);
};

Creep.prototype.taskBuildClosestSites = function(sites) {
  const site = this.pos.findClosestByRange(sites);
  return this.taskBuild(site);
};

Creep.prototype.taskBuild = function(site) {
  if (this.carry.energy === 0) return false;

  site = this.checkId('build', site);
  if (!site) return false;

  const what = this.doBuild(site);
  if (what) {
    this.actionDoubleTime();
  }
  return what;
};
