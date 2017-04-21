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
  const what this.idleRetreat(WORK) || this.actionTask();
  if(what) return what;

  return this.idleRetreat(WORK) || this.actionTask() ||
    this.taskTravelFlag(this.team) || this.taskDismantleAt(this.team) ||
      this.actionDismantleHostile(STRUCTURE_TOWER) ||
      this.actionDismantleHostile(
          this.team.room, STRUCTURE_RAMPART, STRUCTURE_EXTENSION);
};

Creep.prototype.taskDismantleAt = function(obj) {
  const struct = _.sample(obj.pos.lookFor(LOOK_STRUCTURES));
  this.dlog('dismantling', struct);
  return this.actionDismantle(struct);
};

Creep.prototype.actionDismantleHostile = function(...stypes) {
  return this.taskDismantle(
      this.pos.findClosestByRange(
      this.room.find(FIND_HOSTILE_STRUCTURES, {
        filter: s =>
            !stypes.length || _.any(stypes, stype => s.structureType === stype),
      })));
};
