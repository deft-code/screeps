Flag.prototype.roleArcher = function(spawn) {
  let body = [
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    MOVE, RANGED_ATTACK,
  ];
  const nparts = this.memOr('nparts', body.length);
  body = body.slice(0, nparts);
  return this.createRole(spawn, body,{role: 'archer'});
};

Creep.prototype.roleArcher = function() {
  return this.actionTask() || this.actionArcher(this.squad.flag.room) ||
      this.idleMoveNear(this.squad.flag);
};

Creep.prototype.actionArcher = function(room) {
  if (!room) return false;

  const hostiles = room.hostiles;
  if (hostiles.length) {
    return this.actionKite(this.pos.findClosestByRange(hostiles));
  }

  return this.actionKite(_.sample(room.enemies));
};

Creep.prototype.actionKite = function(creep) {
  if (!creep) return false;

  this.memory.task = {
    task: 'kite',
    id: creep.id,
  };
  return this.taskKite();
};

Creep.prototype.idleFlee = function(creeps, range) {
  const room = this.room;
  const callback = (roomName) => {
    if (roomName !== room.name) {
      console.log('Unexpected room', roomName);
      return false;
    }
    const mat = new PathFinder.CostMatrix();
    for (let struct of room.find(FIND_STRUCTURES)) {
      const p = struct.pos;
      if (struct.structureType === STRUCTURE_ROAD) {
        mat.set(p.x, p.y, 1);
      } else if (struct.obstacle) {
        mat.set(p.x, p.y, 255);
      }
    }
    return mat;
  };
  const ret = PathFinder.search(
      this.pos, _.map(creeps, creep => ({pos: creep.pos, range: range})), {
        flee: true,
        roomCallback: callback,
      });

  const next = _.first(ret.path);
  if (!next) return false;

  const err = this.move(this.pos.getDirectionTo(next));
  if (err == OK) return `flee ${next.x} ${next.y}`;

  return false;
};

Creep.prototype.idleAway = function(creep) {
  if (!creep) return false;

  const dir = this.pos.getDirectionAway(creep);
  const err = this.move(dir);
  if (err == OK) return `move away ${dir}`;

  return false;
};

Creep.prototype.taskKite = function() {
  const creep = this.taskId;
  if (!creep) return false;

  if (this.room.hostiles.length && !creep.hostile) {
    this.actionKite(_.first(this.room.hostiles));
  }

  const range = this.pos.getRangeTo(creep);
  let err = ERR_NOT_IN_RANGE;
  switch (range) {
    case 1:
      err = this.rangedMassAttack(creep);
      break;
    case 2:
    case 3:
      err = this.rangedAttack(creep);
      break;
    default:
      return this.idleMoveRange(creep);
  }

  if (err == OK) {
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

Creep.prototype.actionMassAttackStructs = function(structType) {
  const s = this.room.find(FIND_HOSTILE_STRUCTURES);
  const targets = _.filter(s, s => s.structureType == structType);
  return this.actionMassAttackStruct(_.sample(targets));
};

Creep.prototype.actionMassAttackStruct = function(struct) {
  if (!struct) {
    return false;
  }

  this.memory.task = {
    task: 'mass attack struct',
    id: struct.id,
    note: struct.note,
  };
  return this.taskMassAttackStruct();
};

Creep.prototype.taskMassAttackStruct = function() {
  const struct = this.taskId;
  if (!struct) {
    return false;
  }
  if (this.room.hostiles.length) {
    return false;
  }
  if (this.pos.isNearTo(struct)) {
    this.rangedMassAttack();
    return 'bang';
  }
  return this.idleMoveTo(struct);
};

Creep.prototype.actionRangedAttackStruct = function(struct) {
  if (!struct) {
    return false;
  }
  this.memory.task = {
    task: 'ranged attack struct',
    id: struct.id,
  };
  return this.taskRangedAttackStruct();
};

Creep.prototype.taskRangedAttackStruct = function() {
  const struct = this.taskId;
  const err = this.rangedAttack(struct);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(struct);
  }
  if (err == OK) return struct.hits;

  return false;
};
