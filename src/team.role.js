Flag.prototype.teamRole = function() {
  return this.upkeepRole(this.name, 1, 1, this.remoteSpawn()) ||
    "enough";
};
