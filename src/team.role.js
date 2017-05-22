Flag.prototype.teamRole = function() {
  const words = _.words(this.name);
  const mem = {
    role: _.first(words).toLowerCase(),
    body: _.last(words).toLowerCase(),
  };
  return this.upkeepRole(1, mem, 1, this.closeSpawn());
};

Flag.prototype.teamEnsure = function() {
  const words = _.words(this.name);
  const mem = {
    role: _.first(words).toLowerCase(),
    body: _.last(words).toLowerCase(),
  };
  let fn = this.closeSpawn();
  if(this.memory.remote) fn = this.remoteSpawn();

  return this.ensureRole(1, mem, 1, fn);
};
