Flag.prototype.teamRole = function() {
  return this.upkeepRole(
             _.camelCase(this.name.toLowerCase()), 1, 1, this.remoteSpawn()) ||
      'enough';
};
