Flag.prototype.roleBulldozer = function(spawn) {
  const body = [
    MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
    MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
    MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
    MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
  ];
  return this.createRole(spawn, body, {role: 'bulldozer'});
};

Creep.prototype.roleBulldozer = function() {
  return this.idleRetreat(WORK) || this.taskTask() ||
      this.taskTravelFlag(this.team) || this.taskDismantleAt(this.team) ||
      this.taskDismantleHostile(STRUCTURE_TOWER) ||
      this.taskDismantleHostile(
          this.team.room, STRUCTURE_RAMPART, STRUCTURE_EXTENSION);
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
