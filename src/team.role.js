Flag.prototype.teamRole = function() {
  return this.upkeepRole(_.camelCase(this.name), 1, 1, this.remoteSpawn()) ||
    "enough";
};
