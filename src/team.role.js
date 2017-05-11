Flag.prototype.teamRole = function() {
  const words = _.words(this.name);
  const mem = {
    role: _.first(words).toLowerCase(),
    body: _.last(words).toLowerCase(),
  };
  return this.upkeepRole(1, mem, 1, this.closeSpawn()) || 'enough';
};
