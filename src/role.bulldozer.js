Creep.prototype.roleBulldozer = function() {
  return this.idleRetreat(WORK) || this.taskTask() ||
      this.taskMoveFlag(this.team, {allowHostile:true}) ||
      this.taskDismantleAt(this.team) ||
      this.taskDismantleHostile(STRUCTURE_TOWER) ||
      this.taskDismantleHostile(this.room, STRUCTURE_RAMPART, STRUCTURE_EXTENSION) ||
      this.taskStompAll();
};

Creep.prototype.taskStompAll = function() {
  return this.taskStomp(this.pos.findClosestByRange(FIND_HOSTILE_CONSTRUCTION_SITES));
};

Creep.prototype.taskStomp = function(site) {
  site = this.checkId('stomp', site);
  if(!site) return false;
  return this.idleMoveTo(site, {range: 0, allowHostile: true, ignoreCreeps: false});
};

Creep.prototype.taskDismantleAt = function(obj) {
  const struct = _.sample(obj.pos.lookFor(LOOK_STRUCTURES));
  this.dlog('dismantling', struct);
  return this.taskDismantle(struct);
};

Creep.prototype.taskDismantleHostile = function(...stypes) {
  return this.taskDismantle(
      this.pos.findClosestByRange(this.room.find(FIND_HOSTILE_STRUCTURES, {
        filter: s =>
            !stypes.length || _.any(stypes, stype => s.structureType === stype),
      })));
};
