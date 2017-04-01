const util = require('util');
const lib = require('lib');

lib.cachedProp(Creep, 'home', function() {
  return Game.rooms[this.memory.home];
});

lib.cachedProp(Creep, 'team', function() {
  return Game.flags[this.memory.team];
});

lib.roProp(Creep, 'taskId', function() {
  const task = this.memory.task || {};
  return Game.getObjectById(task.id);
});

lib.roProp(Creep, 'taskFlag', function() {
  const task = this.memory.task || {};
  return Game.flags[task.flag];
});

lib.roProp(Creep, 'taskCreep', function() {
  const task = this.memory.task || {};
  return Game.creeps[task.creep];
});

lib.cachedProp(
    Creep, 'atTeam', creep => creep.room.name === creep.team.pos.roomName);
lib.cachedProp(Creep, 'atHome', creep => creep.room.name === creep.memory.home);

lib.cachedProp(Creep, 'teamRoom', creep => creep.team && creep.team.room);

Creep.prototype.run = function() {
  if (this.spawning) {
    this.memory.home = this.room.name;
    this.memory.cpu = 0;
    return 'spawning';
  }

  const start = Game.cpu.getUsed();
  util.markDebug(this);
  this.intents = {
    move: this.fatigue > 0 ? 'tired' : false,
  };

  const role = _.camelCase('role ' + this.memory.role);
  const roleFunc = this[role] || this.roleUndefined;
  const what = roleFunc.apply(this);

  if (this.memory.task) {
    const first = this.memory.task.first;
    if (first && first.roomName === this.room.name) {
      this.room.visual.line(this.pos, first);
    }
    delete this.memory.task.first;
  }

  const total = Math.floor(1000 * (Game.cpu.getUsed() - start));
  this.memory.cpu += total;
  let rate = this.memory.cpu;
  const age = CREEP_LIFE_TIME - this.ticksToLive;
  if (age > 0) {
    rate = Math.floor(rate / age);
  }

  this.dlog(`cpu ${total}:${rate} ${what}`);
};

Creep.prototype.busy = function(...intents) {
  return _.any(intents, intent => this.intents[intent]);
};

Creep.prototype.doMove = function(dir) {
  if (this.busy(MOVE)) return this.intents.move;
  if (!target) return false;

  const err = this.move(dir);
  switch (err) {
    case OK:
      this.intents.move = `direction ${dir}`;
      return this.intents.move;
    case ERR_TIRED:
    case ERR_BUSY:
      console.log(this, 'Unexpected move error!', err);
  }
  return false;
};

Creep.prototype.doMoveTo = function(target, opts = {}) {
  if (this.busy(MOVE)) return this.intents.move;
  if (!target) return false;

  const weight = this.weight;
  const fatigue = this.bodyInfo().fatigue;
  this.dlog('doMoveTo', weight, fatigue, target);

  opts = _.defaults(opts, {
    // useFindRoute: true,
    ignoreRoads: fatigue > weight,
  });
  const err = this.travelTo(target, opts);
  switch (err) {
    case OK:
      this.intents.move = target;
      return `move ${target.pos}`;
    case ERR_TIRED:
    case ERR_BUSY:
      console.log(this, 'Unexpected moveTo error!', err);
  }
  return false;
};

Creep.prototype.doHarvest = function(src) {
  if (this.busy('melee')) return false;

  const err = this.harvest(src);
  if (err == OK) {
    this.intents.melee = src;
    return src.energy + 1;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(src);
  }
  return false;

};

Creep.prototype.doBuild = function(site) {
  if (this.busy('melee', 'range')) return false;

  const err = this.build(site);
  if (err == OK) {
    this.intents.melee = this.intents.range = site;
    return site.progressTotal - site.progress;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveRange(site);
  }
  return false;
};

Creep.prototype.doRepair = function(struct) {
  if (this.busy('melee', 'range')) return false;

  const err = this.repair(struct);
  if (err == OK) {
    this.intents.melee = this.intents.range = struct;
    return struct.hits;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveRange(struct);
  }
  return false;
};

Creep.prototype.doDismantle = function(struct) {
  if (this.busy('melee')) return false;

  const err = this.dismantle(struct);
  if (err == OK) {
    this.intents.melee = struct;
    return struct.hits;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(struct);
  }
  return false;
};

Creep.prototype.doHeal = function(creep) {
  if (this.busy('melee')) return false;

  const err = this.heal(struct);
  if (err == OK) {
    this.intents.melee = creep;
    return creep.hurts;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(creep);
  }
  return false;
};

Creep.prototype.doRangedHeal = function(creep) {
  if (this.busy('melee', 'range')) return false;

  const err = this.rangeHeal(struct);
  if (err == OK) {
    this.intents.melee = this.intents.range = creep;
    return creep.hurts;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveRange(creep);
  }
  return false;
};

Creep.prototype.doRangedAttack = function(creep) {
  if (this.busy('range')) return false;

  const err = this.rangedAttack(struct);
  if (err == OK) {
    this.intents.range = creep;
    return creep.hits;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveRange(creep);
  }
  return false;
};

Creep.prototype.doMassAttack = function() {
  if (this.busy('range')) return false;

  const err = this.rangedMassAttack();
  if (err == OK) {
    return this.intents.range = 'mass attack';
  }
  return false;
};

Creep.prototype.doAttack = function(creep) {
  if (this.busy('melee')) return false;

  const err = this.attack();
  if (err == OK) {
    return this.intents.melee = `attack ${creep.pos}`;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(creep);
  }
  return false;
};

Creep.prototype.slurpWithdraw = function(struct) {
  const err = this.withdraw(struct, RESOURCE_ENERGY);
  if (err === OK) {
    this.intents.withdraw = struct;
    return struct.note;
  }
  return false;
};

Creep.prototype.slurpSrc = function() {
  if (!this.carryFree) return false;
  if (this.intents.withdraw) return false;

  const p = this.pos;
  const structs = this.room.lookForAtArea(
      LOOK_STRUCTURES, p.y - 1, p.x - 1, p.y + 1, p.x + 1, true);

  const struct = _.find(structs, spot => {
    const s = spot.structure;
    switch (s.structureType) {
      case STRUCTURE_CONTAINER:
      case STRUCTURE_LINK:
        return s.mode === 'src' && (s.energy > 0 || s.store.energy > 0);
      case STRUCTURE_STORAGE:
        return s.store.energy > 100000;
    }
    return false;
  });

  return this.slurpWithdraw(struct);
};

Creep.prototype.slurp = function() {
  if (!this.carryFree) return false;
  if (this.intents.withdraw) return false;

  const p = this.pos;
  const spots = this.room.lookForAtArea(
      LOOK_STRUCTURES, p.y - 1, p.x - 1, p.y + 1, p.x + 1, true);

  const types = [
    STRUCTURE_ROAD,
    STRUCTURE_WALL,
    STRUCTURE_RAMPARTS,
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
  ];

  const struct = _.find(
      spots,
      spot => !_.contains(types, spot.structure.structureType) &&
          (spot.structure.energy > 0 ||
           (spot.structure.store && spot.structure.store.energy > 0)));

  return this.slurpWithdraw(struct);
};

Creep.prototype.shareSrc = function() {
  if (!this.carry.energy) return false;
  if (this.intents.transfer) return false;

  const p = this.pos;
  const spots = this.teamRoom.lookForAtArea(
      LOOK_STRUCTURES, p.y - 1, p.x - 1, p.y + 1, p.x + 1, true);

  const struct = _.find(spots, spot => {
    const s = spot.structure;
    switch(s.structureType) {
      case STRUCTURE_CONTAINER:
        return !this.room.energyFreeAvailable && s.mode === 'sink';
      case STRUCTURE_SPAWN:
      case STRUCTURE_EXTENSION:
      case STRUCTURE_TOWER:
        return this.energyFree;
    }
    return false;
  });
  return this.shareTransfer(struct);
};

Creep.prototype.share = function() {
  if (!this.carry.energy) return false;
  if (this.intents.transfer) return false;

  const p = this.pos;
  const spots = this.teamRoom.lookForAtArea(
      LOOK_STRUCTURES, p.y - 1, p.x - 1, p.y + 1, p.x + 1, true);

  const struct = _.find(
      spots, spot => spot.structure.energyFree || spot.structure.storeFree;);

  return this.shareTransfer(struct);
};

Creep.prototype.shareTransfer = function(struct) {
  const err = this.transfer(struct, RESOURCE_ENERGY);
  if (err === OK) {
    this.intents.transfer = struct;
    return struct.note;
  }
  return false;
};

Creep.prototype.doTransfer = function(target, resource, ...amount) {
  if (this.busy('transfer')) return false;

  this.dlog('attempt transfer', target, resource);

  const err = this.transfer(target, resource, ...amount);
  if (err == OK) {
    this.intents.transfer = target;
    return 'success';
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(target);
  }
  this.dlog('doTransfer error!', err);
  return false;
};


Creep.prototype.doWithdraw = function(target, resource, amount) {
  if (this.busy('withdraw')) return false;

  const err = this.withdraw(target, resource, amount);
  if (err == OK) {
    this.intents.withdraw = target;
    return 'success';
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(target);
  }
  return false;
};

Creep.prototype.doUpgradeController = function(controller) {
  const err = this.upgradeController(controller);
  if (err == OK) {
    return controller.progress
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(controller);
  }
};

lib.cachedProp(
    Creep, 'partsByType',
    creep => _(creep.body).filter(part => part.hits).countBy('type').value());

lib.cachedProp(
    Creep, 'ignoreRoads',
    creep => creep.body.length >= 2 * creep.getActiveBodyparts(MOVE));

lib.cachedProp(
    Creep, 'hostile',
    creep => creep.getActiveBodyparts(ATTACK) ||
        creep.getActiveBodyparts(RANGED_ATTACK));

lib.cachedProp(
    Creep, 'assault',
    creep => creep.hostile || creep.getActiveBodyparts(WORK) ||
        creep.getActiveBodyparts(CLAIM) >= 5);
