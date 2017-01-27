
Creep.prototype.roleSnipe = function() {
  return this.actionTask() || this.actionTravel(Game.flags.snipe) ||
      this.actionSnipe();  //        this.taskGoHome();
};

Creep.prototype.actionSnipe = function() {
  if (this.room.controller.my) {
    return false;
  }
  const spawn = _(this.room.find(FIND_HOSTILE_STRUCTURES))
                    .filter(s => s.structureType == STRUCTURE_SPAWN)
                    .sample();
  if (spawn) {
    return this.actionAttackStruct(spawn);
  }

  const creeps = this.room.find(FIND_HOSTILE_CREEPS);
  const creep = this.pos.findClosestByRange(creeps);
  if (creep) {
    return this.actionAttackStruct(creep);
  }

  const extns = _.filter(
      this.room.cachedFind(FIND_HOSTILE_STRUCTURES),
      s => s.structureType == STRUCTURE_EXTENSION);

  const extn = this.pos.findClosestByRange(extns);
  if (extn) {
    return this.actionAttackStruct(extn);
  }

  const neutrals = _.filter(
      this.room.cachedFind(FIND_STRUCTURES),
      s => s.structureType == STRUCTURE_ROAD);

  this.dlog('snipe neutrals', neutrals);
  const neutral = this.pos.findClosestByRange(neutrals);
  if (neutral) {
    return this.actionAttackStruct(neutral);
  }

  const walls = _.filter(
      this.room.cachedFind(FIND_STRUCTURES),
      s => s.structureType == STRUCTURE_WALL);

  this.dlog('snipe neutrals', neutrals);
  const wall = this.pos.findClosestByRange(neutrals);
  if (wall) {
    return this.actionAttackStruct(wall);
  }

  return false;
};

StructureSpawn.prototype.roleDismantler = function() {
  const body = [
    CARRY, MOVE, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE,
    WORK,  MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
    MOVE,  WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE,
    WORK,  MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
  ];
  return this.createRole(body, 4, {role: 'dismantler'});
};

Creep.prototype.roleDismantler = function() {
  return this.actionTask() || (this.drop(RESOURCE_ENERGY) && false) ||
      this.actionTravel(Game.flags.dismantler) ||
      this.actionDismantleAt(Game.flags.dismantler);
};

Creep.prototype.actionDismantleAt = function(obj) {
  const struct = _.sample(obj.pos.lookFor(LOOK_STRUCTURES));
  return this.actionDismantle(struct);
};

Creep.prototype.roleAssassin = function(struct) {
  return this.actionTask() ||
      this.actionTravel(Game.flags.assassin) || this.actionAssassin();

};

Creep.prototype.actionAssassin = function() {
  let spawn = _(this.room.cachedFind(FIND_STRUCTURES))
                  .filter(s => !s.my && s.structureType == STRUCTURE_SPAWN)
                  .sample();
  return this.actionDismantle(Game.getObjectById('5866a77ce943cb9e23dffd75')) ||
      this.actionDismantle(spawn);
};

Creep.prototype.actionAttackStruct = function(struct) {
  if (!struct) {
    return false;
  }
  this.memory.task = {
    task: 'attack struct',
    attack: struct.id,
    note: modutil.structNote(struct.structureType || 'creep', struct.pos),
  };
  return this.taskAttackStruct();
};

Creep.prototype.taskAttackStruct = function() {
  const struct = Game.getObjectById(this.memory.task.attack);
  if (!struct) {
    console.log('BAD attack struct', JSON.stringify(this.memory));
    return false;
  }
  const err = this.attack(struct);
  if (err == ERR_NOT_IN_RANGE) {
    return this.actionMoveTo(struct);
  }
  if (err == OK) {
    this.move(this.pos.getDirectionTo(struct.pos));
    return struct.hits;
  }
  console.log('BAD attack', err);
  return false;
};

StructureSpawn.prototype.roleSnipe = function() {
  const body = [
    ATTACK, MOVE, ATTACK, MOVE, ATTACK, MOVE, ATTACK, MOVE,
    ATTACK, MOVE, ATTACK, MOVE, ATTACK, MOVE, ATTACK, MOVE,
    ATTACK, MOVE, ATTACK, MOVE, ATTACK, MOVE, ATTACK, MOVE,
  ];
  return this.createRole(body, 2, {role: 'snipe'});
};

StructureSpawn.prototype.roleThief = function(flag) {
  const body = [
    MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,
    CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY, MOVE,  CARRY,
  ];
  return this.createRole(body, 4, {role: 'thief', flag: flag});
};

Creep.prototype.roleThief = function() {
  return this.actionTask() || this.actionThief();
};

Creep.prototype.actionThief = function() {
  const flag = Game.flags[this.memory.flag];
  this.dlog('thief', flag, this.home);
  if (!flag) {
    return false;
  }
  if (this.pos.roomName == this.home.name) {
    if (this.carryTotal) {
      return this.actionStoreAny();
    } else {
      return this.actionTravel(flag);
    }
  } else {
    if (this.carryTotal) {
      return this.actionMoveTo(this.home.controller);
    } else {
      return this.actionUnstoreAny();
    }
  }
  return false;
};
