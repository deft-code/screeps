const util = require('util');

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
  return this.idleRetreat(WORK) || this.actionTask() ||
      this.taskTravelFlag(this.team) || this.actionDismantleAt(this.team) ||
      this.actionDismantleHostile(this.team.room, STRUCTURE_TOWER) ||
      this.actionDismantleHostile(
          this.team.room, STRUCTURE_RAMPART, STRUCTURE_EXTENSION);
};

Creep.prototype.actionDismantleAt = function(obj) {
  const struct = _.sample(obj.pos.lookFor(LOOK_STRUCTURES));
  this.dlog('dismantling', struct);
  return this.actionDismantle(struct);
};

Creep.prototype.actionDismantleHostile = function(room, ...stypes) {
  if (!room) return false;

  return this.actionDismantle(
      util.pickClosest(this.pos, room.find(FIND_HOSTILE_STRUCTURES, {
        filter: s =>
            !stypes.length || _.any(stypes, stype => s.structureType === stype),
      })));
};
