let modutil = require('util');

Creep.prototype.actionBuildRoom = function(room) {
  if(!room) return false;
  const sites = room.cachedFind(FIND_MY_CONSTRUCTION_SITES);
  return this.actionBuildFinish(sites);
}

Creep.prototype.actionBuildFinish = function(sites) {
  if (!sites) {
    sites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
  }
  const byProgress = _.groupBy(sites, site => Math.floor(site.progress/300));
  const max = _.max(_.keys(byProgress));
  const site = this.pos.findClosestByRange(byProgress[max]);
  return this.actionBuild(site);
};

Creep.prototype.actionBuildStruct = function(structureType, room) {
  room = room || this.home;
  const sites = _.filter(
      room.find(FIND_MY_CONSTRUCTION_SITES),
      site => site.structureType == structureType);
  return this.actionBuildFinish(sites);
};

Creep.prototype.actionBuildNear = function() {
  const sites = _.filter(
      this.home.find(FIND_MY_CONSTRUCTION_SITES),
      s => this.pos.inRangeTo(s, 3));
  return this.actionBuildFinish(sites);
};

Creep.prototype.actionBuild = function(site) {
  if (!site) {
    return false;
  }
  this.memory.task = {
    task: 'build',
    id: site.id,
    note: modutil.structNote(site.structureType, site.pos),
  };
  this.say(this.memory.task.note);

  return this.taskBuild();
};

Creep.prototype.taskBuild = function() {
  let site = this.taskId;
  if (!site) {
    return this.actionBuildNear();
  }
  if (this.carry.energy == 0) {
    this.say('recharge');
    this.actionRecharge(this.carryCapacity/2, site.pos);
  }
  const err = this.build(site);
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveRange(site);
  }
  if (err == OK) {
    this.actionDoubleTime();
    return 'building';
  }
  return false;
};

Creep.prototype.actionDismantleAny = function() {
    
    // TODO fix dismantling
    return false;
  if (!this.carryFree) {
    return false;
  }
  const target = _(this.room.cachedFind(FIND_STRUCTURES))
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
    this.dlog("toofull", this.carryCapacity, drop, this.carryFree);
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
      console.log("protect mine");
    return false;
  }
  return this.doDismantle(structure) && structure.hits;
};

Creep.prototype.actionRepairAny = function() {
  const room = this.team.room;
  if(!room) return false;

  const target = _(room.find(FIND_STRUCTURES))
                     .tap(s => this.dlog("repairs",_.map(s, "repairs")))
                     .filter(s => s.repairs > 0)
                     .tap(s => this.dlog("repairs", s))
                     .sample(3)
                     .sortBy('repairs')
                     .last();

  this.dlog(`repair ${target}`);
  return this.actionRepair(target);
};

Creep.prototype.actionRepairStruct = function(structureType, room) {
  room = room || this.home;
  const target =
      _(room.cachedFind(FIND_STRUCTURES))
          .filter(s => s.repairs > 0 && s.structureType == structureType)
          .sample(3)
          .sortBy('repairs')
          .last();

  return this.actionRepair(target);
};

Creep.prototype.actionRepairNear = function() {
  const room = this.room;
  const struct =
      _(room.find(FIND_STRUCTURES))
          .filter(
              s => s.structureType != STRUCTURE_WALL &&
                  s.structureType != STRUCTURE_RAMPART && s.hits < s.hitsMax &&
                  this.pos.inRangeTo(s, 3) && !this.dismantle)
          .sample();
  return this.actionRepair(struct);
};

Creep.prototype.actionRepair = function(struct) {
  this.dlog(`repair ${struct}`);
  if (!struct) return false;

  this.memory.task = {
    task: 'repair',
    id: struct.id,
    note: struct.note,
  };
  this.say(this.memory.task.note);
  return this.taskRepair();
};

Creep.prototype.taskRepair = function() {
  const structure = this.taskId;
  if (!structure) {
    return false;
  }
  if (structure.hitsMax == structure.hits) {
    return this.actionRepairNear();
  }
  if (structure.structureType == STRUCTURE_RAMPART && structure.repairs < -1) {
    return this.actionRepairNear()
  }
  // Do not do the same for rampart since the reparts are degrading and we need
  // to repair them as much as possible.
  if (structure.structureType === STRUCTURE_WALL && structure.repairs <= 0) {
    return this.actionRepairNear();
  }
  if (!this.carry.energy) {
    return this.actionRecharge(this.carryCapacity, structure.pos);
  }
  if(this.doRepair(structure)) {
    this.actionDoubleTime();
    return structure.hits;
  }
  return false;
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
      this.actionBuildStruct(STRUCTURE_ROAD) ||
      this.actionBuildStruct(STRUCTURE_TOWER) ||
      this.actionBuildStruct(STRUCTURE_EXTENSION) ||
      this.actionBuildStruct(STRUCTURE_CONTAINER) || 
      this.actionBuildFinish() ||
      this.actionRepairAny() || 
      this.taskUpgrade() || 
      this.actionHarvestAny();
};

Creep.prototype.roleBootstrap = function() {
  return this.actionTask() || this.actionStoreResource() ||
      this.actionPoolCharge() || this.actionTowerCharge() ||
      this.actionUpgrade() || this.actionHarvestAny();
};

const upkeepWalls = function(room) {
  if (room.memory.freezeWalls) {
    return;
  }
  if (!room.memory.wallMin) {
    room.memory.wallMin = 10000;
  }
  if (Game.time % 100 == 0) {
    let walls = room.Structures(STRUCTURE_WALL);
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

const upkeepDismantle = function(room) {
  let flags = room.find(FIND_FLAGS, {filter: {name: 'dismantle'}});
  let newflags = _(flags)
                     .filter(f => f.color != COLOR_RED)
                     .map(f => room.lookForAt(LOOK_STRUCTURES, f.pos))
                     .flatten()
                     .value();
  // console.log("new flags", newflags.length, JSON.stringify(newflags));

  _.each(s => {
    console.log('for munchees', JSON.stringify(s));
  });
  newflags.forEach(s => {
    console.log('new munch', s.id, 'was', JSON.stringify(s.memory));
    s.dismantle();
  });

  flags.forEach(f => {
    if (f.color == COLOR_RED) {
      if (f.secondaryColor == COLOR_RED) {
        f.remove();
      } else {
        f.setColor(COLOR_RED, COLOR_RED);
      }
    } else {
      f.setColor(COLOR_RED, f.secondaryColor);
    }
  });
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

StructureSpawn.prototype.roleWorker = function() {
  let body = [
    CARRY, WORK,  MOVE, CARRY, MOVE,  WORK, CARRY, MOVE,  WORK, CARRY, MOVE,
    WORK,  CARRY, MOVE, WORK,  CARRY, MOVE, WORK,  CARRY, MOVE, WORK,
  ];
  return this.createRole(body, 3, {role: 'worker'});
};


StructureSpawn.prototype.roleUpgrader = function() {
  let body = [
    CARRY,
    CARRY,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
    WORK,
    MOVE,
  ];
  return this.createRole(body, 3, {role: 'upgrader'});
};

Creep.prototype.roleUpgrader = function() {
  return this.taskDoubleTime() || this.actionTask() || this.actionUpgrade() ||
      this.actionRecharge();
};

function upkeep(room) {
  upkeepDismantle(room);
  upkeepWalls(room);

  return false;
}

module.exports = {
  upkeep: upkeep,

};
