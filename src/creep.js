const modutil = require('util');

modutil.cachedProp(Creep, 'home', function() {
  return Game.rooms[this.memory.home];
});

modutil.cachedProp(Creep, 'team', function() {
  return Game.flags[this.memory.team];
});

modutil.roProp(Creep, 'taskId', function() {
  const task = this.memory.task || {};
  return Game.getObjectById(task.id);
});

modutil.roProp(Creep, 'taskFlag', function() {
  const task = this.memory.task || {};
  return Game.flags[task.flag];
});

modutil.roProp(Creep, 'taskCreep', function() {
  const task = this.memory.task || {};
  return Game.creeps[task.creep];
});

Creep.prototype.run = function() {
  const start = Game.cpu.getUsed();
  modutil.markDebug(this);
  this.intents = {
    move: this.fatigue > 0 ? 'tired' : false,
  };
  let what = this.actionSpawning() || this.actionRole();
  const total = Math.floor(1000* (Game.cpu.getUsed() - start));
  if (!this.memory.cpu) {
    this.memory.cpu = 0;
  }
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
  if (this.busy(MOVE)) return false;
  if (!target) return false;

  opts = _.defaults(opts, {
    useFindRoute: true,
  });
  const err = this.travelTo(target, opts);
  switch (err) {
    case OK:
      this.intents.move = `move ${target.pos}`;
      return this.intents.move;
    case ERR_TIRED:
    case ERR_BUSY:
      console.log(this, 'Unexpected moveTo error!', err);
  }
  return false;
};

Creep.prototype.doHarvest = function(src) {
  if(this.busy('melee')) return false;

  const err = this.harvest(src);
  if (err == OK) {
    return this.intents.melee = `src ${src.pos}`;
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
    return this.intents.melee = this.intents.range = `build ${site.pos}`;
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
    return this.intents.melee = this.intents.range = `repair ${struct.note}`;
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
    return this.intents.melee = `dismantle ${struct.note}`;
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
    return this.intents.melee = `heal ${creep.name}`;
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
    return this.intents.melee = this.intents.range = `range heal ${creep.name}`;
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
    return this.intents.range = `attack ${creep.pos}`;
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

Creep.prototype.doTransfer = function(target, resource, ...amount) {
  if (this.busy('transfer')) return false;

  const err = this.transfer(target, resource, ...amount);
  if (err == OK) {
    return this.intents.transfer = `xfer ${target.pos}`;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(target);
  }
  return false;
};

Creep.prototype.doWithdraw = function(target, resource, ...amount) {
  if (this.busy('withdraw')) return false;

  const err = this.withdraw(target, resource, ...amount);
  if (err == OK) {
    return this.intents.withdraw = `withdraw ${target.pos}`;
  }
  if (err == ERR_NOT_IN_RANGE) {
    return this.idleMoveNear(target);
  }
  return false;
};

modutil.cachedProp(
    Creep, 'partsByType',
    creep => _(creep.body).filter(part => part.hits).countBy('type').value());

modutil.cachedProp(
    Creep, 'ignoreRoads',
    creep => creep.body.length >= 2 * creep.getActiveBodyparts(MOVE));
modutil.cachedProp(
    Creep, 'hostile',
    creep => creep.getActiveBodyparts(ATTACK) ||
        creep.getActiveBodyparts(RANGED_ATTACK));

modutil.cachedProp(
    Creep, 'assault',
    creep => creep.hostile || creep.getActiveBodyparts(WORK) ||
        creep.getActiveBodyparts(CLAIM) >= 5);
