const params = (flag) => {
  const words = _.words(flag.name);
  const mem = {
    role: _.first(words).toLowerCase(),
    body: _.last(words).toLowerCase(),
  };
  if(flag.memory.max) mem.max = flag.memory.max;

  let fn = flag.closeSpawn();
  if(flag.memory.remote) fn = flag.remoteSpawn();
  return [mem, fn];
};

Flag.prototype.teamRole = function() {
  const [mem, fn] = params(this);
  return this.upkeepRole(1, mem, 1, fn);
};

Flag.prototype.teamEnsure = function() {
  const [mem, fn] = params(this);
  return this.ensureRole(1, mem, 1, fn);
};
