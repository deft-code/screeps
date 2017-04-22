Flag.prototype.roleSnipe = function(spawn) {
  const body = [
    TOUGH, MOVE,   TOUGH, MOVE,   TOUGH, TOUGH,  MOVE, ATTACK, MOVE, ATTACK,
    MOVE,  ATTACK, MOVE,  ATTACK, MOVE,  ATTACK, MOVE, ATTACK, MOVE, ATTACK,
    MOVE,  ATTACK, MOVE,  ATTACK, MOVE,  ATTACK, MOVE, ATTACK, MOVE, ATTACK,
    MOVE,  ATTACK, MOVE,  ATTACK, MOVE,  ATTACK, MOVE, ATTACK, MOVE, ATTACK,
    MOVE,  ATTACK, MOVE,  ATTACK, MOVE,  ATTACK, MOVE,
  ];
  return this.createRole(spawn, body, {role: 'snipe'});
};

Creep.prototype.roleSnipe = function() {
  return this.taskTask() || this.taskTravelFlag(Game.flags.snipe) ||
      this.taskSnipe();
};

Creep.prototype.taskSnipe = function() {
  if (this.room.controller.my) {
    return false;
  }
  const tower = _(this.room.find(FIND_HOSTILE_STRUCTURES))
                    .filter(s => s.structureType == STRUCTURE_TOWER)
                    .sample();
  if (tower) {
    return this.taskAttackStruct(tower);
  }

  const spawn = _(this.room.find(FIND_HOSTILE_STRUCTURES))
                    .filter(s => s.structureType == STRUCTURE_SPAWN)
                    .sample();
  if (spawn) {
    return this.taskAttackStruct(spawn);
  }

  const creeps = this.room.find(FIND_HOSTILE_CREEPS);
  const creep = this.pos.findClosestByRange(creeps);
  if (creep) {
    return this.taskAttackStruct(creep);
  }

  const extns = _.filter(
      this.room.find(FIND_HOSTILE_STRUCTURES),
      s => s.structureType == STRUCTURE_EXTENSION);

  const extn = this.pos.findClosestByRange(extns);
  if (extn) {
    return this.taskAttackStruct(extn);
  }

  const neutrals = _.filter(
      this.room.find(FIND_STRUCTURES), s => s.structureType == STRUCTURE_ROAD);

  this.dlog('snipe neutrals', neutrals);
  const neutral = this.pos.findClosestByRange(neutrals);
  if (neutral) {
    return this.taskAttackStruct(neutral);
  }

  const walls = _.filter(
      this.room.find(FIND_STRUCTURES), s => s.structureType == STRUCTURE_WALL);

  this.dlog('snipe neutrals', neutrals);
  const wall = this.pos.findClosestByRange(neutrals);
  if (wall) {
    return this.taskAttackStruct(wall);
  }

  return false;
};

Creep.prototype.taskAttackStruct = function(struct) {
  if (!struct) {
    return false;
  }
  this.memory.task = {
    task: 'attack struct',
    attack: struct.id,
    // note: modutil.structNote(struct.structureType || 'creep', struct.pos),
  };
  return this.taskAttackStruct();
};

Creep.prototype.taskAttackStruct = function() {
  const struct = Game.getObjectById(this.memory.task.attack);
  if (!struct) {
    console.log('BAD attack struct', JSON.stringify(this.memory.task));
    return false;
  }
  const err = this.attack(struct);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveTo(struct);
  }
  if (err == OK) {
    this.move(this.pos.getDirectionTo(struct.pos));
    return struct.hits;
  }
  console.log('BAD attack', err);
  return false;
};
