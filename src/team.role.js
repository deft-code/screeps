Flag.prototype.teamRole = function() {
  return this.upkeepRole(this.name, 1, 850, 1, 2) ||
    "enough";
};
