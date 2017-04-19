Flag.prototype.roleMiner = function(spawn) {
  const body = [
    MOVE,
    CARRY,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
  ];
  return this.createRole(spawn, body, {role: 'miner'});
};

Creep.prototype.roleMiner = function() {
  let what = this.actionTask();
  if (what) return what;

  if (this.atTeam) {
    const peers = this.team.roleCreeps('miner');
    if (peers.length < 2) {
      let src = _.first(this.room.find(FIND_SOURCES_ACTIVE));
      if (!src) {
        src = _.first(this.room.find(FIND_SOURCES));
      }
      return this.taskMine(src);
    }
    console.log('BROKEN MINER', this, this.where);
  }
  return this.taskTravelFlag(this.team);
};

Creep.prototype.taskMine = function(src) {
  src = this.checkId('mine', src);
  return this.doHarvest(src);
};
