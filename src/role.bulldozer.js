Flag.prototype.roleBulldozer = function(spawn) {
  const body = [
    MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
    MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
    MOVE,  WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
    MOVE,  WORK,  MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
  ];
  return this.createRole(spawn, body, {role: 'bulldozer'});
};

Creep.prototype.roleBulldozer = function() {
  return this.idleRetreat(WORK) ||
      this.actionTask() ||
      this.actionTravelFlag(this.team) ||
      this.actionDismantleAt(this.team) ||
      this.actionDismantleHostile(this.team.room, STRUCTURE_TOWER) ||
      this.actionDismantleHostile(this.team.room,
        STRUCTURE_RAMPART, STRUCTURE_EXTENSION);
};

Creep.prototype.actionDismantleAt = function(obj) {
  const struct = _.sample(obj.pos.lookFor(LOOK_STRUCTURES));
  this.dlog("dismantling", struct);
  return this.actionDismantle(struct);
};

Creep.prototype.actionDismantleHostile = function(room, ...stypes) {
  if(!room) return false;

  return this.actionDismantle(_(room.find(FIND_HOSTILE_STRUCTURES))
    .filter(s => _.any(stypes, stype=>!stypes.length || s.structureType === stype))
    .sample());
};
