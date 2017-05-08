Flag.prototype.roleArcher = function(spawn) {
  let body = [
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH,         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, RANGED_ATTACK,
  ];
  const nparts = this.memOr('nparts', body.length);
  body = body.slice(0, nparts);
  return this.createRole(spawn, body, {role: 'archer'});
};

Creep.prototype.roleArcher = function() {
  return this.taskTask() || this.taskArcher() ||
      this.moveNear(this.team);
};

Creep.prototype.taskArcher = function() {
  const hostiles = this.room.hostiles;
  if (hostiles.length) {
    return this.taskKite(this.pos.findClosestByRange(hostiles));
  }

  return this.taskKite(_.sample(this.room.enemies));
};

Creep.prototype.taskKite = function(creep) {
  creep = this.checkId('kite', creep);
  if (!creep) return false;
  if (!creep.hostile) return false;

  const range = this.pos.getRangeTo(creep);
  let err = ERR_NOT_IN_RANGE;
  switch (range) {
    case 1:
      err = this.rangedMassAttack(creep);
      break;
    case 2:
    case 3:
      err = this.goRangedAttack(creep, false);
      break;
    default:
      return this.moveRange(creep);
  }

  if (err === OK) {
    if (creep.hostile) {
      if (range < 3) {
        return this.idleFlee(this.room.hostiles, 3);
      }
    } else {
      if (range > 1) {
        return this.idleMoveTo(creep);
      }
    }
    return 'stay';
  }
  return false;
};

