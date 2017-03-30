let modutil = require('util');

Flag.prototype.roleWorker = function(spawn) {
  const body = [
    CARRY, WORK, MOVE, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
    CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK,
    WORK,  MOVE, WORK, MOVE,  WORK, MOVE, WORK,  MOVE, WORK, MOVE,
  ];
  return this.createRole(spawn, body, {role: 'worker'});
};

Creep.prototype.actionDismantleAny = function() {

  // TODO fix dismantling
  return false;
  if (!this.carryFree) {
    return false;
  }
  const target = _(this.room.find(FIND_STRUCTURES))
                     .filter(s => s.dismantle)
                     .sample(3)
                     .sortBy('hits')
                     .first();
  return this.actionDismantle(target, true);
};

Creep.prototype.actionDismantle = function(struct, drop) {
  if (!struct) {
    return false;
  }
  if (this.carryCapacity && !drop && !this.carryFree) {
    this.dlog('toofull', this.carryCapacity, drop, this.carryFree);
    return false;
  }
  this.memory.task = {
    task: 'dismantle',
    id: struct.id,
    drop: drop,
    note: struct.note,
  };
  return this.taskDismantle();
};

Creep.prototype.taskDismantle = function() {
  if (this.carryCapacity && !this.carryFree && !this.memory.task.drop) {
    this.say('Full');
    return false;
  }
  let structure = this.taskId;
  if (!structure || (structure.my && !structure.dismantle)) {
    console.log('protect mine');
    return false;
  }
  return this.doDismantle(structure) && structure.hits;
};

Creep.prototype.actionEmergencyUpgrade = function() {
  const room = Game.rooms[this.memory.home] || this.room;
  if (room.controller.ticksToDowngrade < 3000) {
    return actionUpgrade(creep);
  }
  return false;
};

Creep.prototype.roleWorker = function() {
  this.idleNom();
  return this.taskDoubleTime() || this.actionTask() ||
      this.actionStoreResource() ||
      this.taskBuildOrdered() ||
      this.taskRepairOrdered() || this.taskUpgrade() || this.taskHarvestAny();
};

const upkeepWalls = function(room) {
  if (room.memory.freezeWalls) {
    return;
  }
  if (!room.memory.wallMin) {
    room.memory.wallMin = 10000;
  }
  if (Game.time % 100 == 0) {
    let walls = room.findStructs(STRUCTURE_WALL);
    if (!walls.length) {
      return false;
    }
    const m = Math.floor(walls.length / 2);
    let s = _.sortBy(walls, 'hits');
    const old = room.memory.wallMin;
    room.memory.wallMin = walls[m].hits;

    console.log(room.name, 'wallMin:', old, '=>', room.memory.wallMin);
  }
};

Creep.prototype.actionUpgrade = function(room) {
  room = room || this.team && this.team.room || this.room;
  this.memory.task = {
    task: 'upgrade',
    note: this.pos.roomName,
  };
  return this.taskUpgrade();
};

Creep.prototype.taskUpgrade = function() {
  const controller = this.team.room.controller;
  if (!controller) {
    return false;
  }
  if (!this.carry.energy) {
    return this.actionRecharge(undefined, controller.pos);
  }
  const err = this.upgradeController(controller);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveRange(controller);
  }
  if (err == OK) {
    this.actionDoubleTime();
  }
  return 'upgrade ' + controller.progress;
};

function upkeep(room) {
  upkeepWalls(room);
}

module.exports = {
  upkeep: upkeep,
};
