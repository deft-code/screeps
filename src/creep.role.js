Creep.prototype.runRole = function() {
  if (!this.memory.home) {
    this.memory.home = this.room.name;
  }
  if(this.spawning) return 'Spawning';

  const pre = this[this.memory.pre];
  if(_.isFunction(pre)) pre.apply(this);

  const post = this[this.memory.post];
  if(_.isFunction(post)) defer post.apply(this);

  let what = this.runTask();
  if(what) return what;

  const role = _.camelCase('role ' + this.memory.role);
  const roleFunc = this[role] || this.roleUndefined;
  return roleFunc.apply(this);
};

Creep.prototype.roleUndefined = function() {
  this.dlog('Missing Role!');
};

Creep.prototype.runTask = function() {
  let task = this.memory.task;
  if (!task) {
    return false;
  }
  let taskFunc = this[_.camelCase('task ' + task.task)];
  if (!taskFunc) {
    console.log('BAD TASK', JSON.stringify(task));
    return false;
  }
  let what = taskFunc.apply(this);
  if (!what || what == 'success') {
    delete this.memory.task;
  }
  return what;
};

Creep.prototype.taskify = function(name, obj) {
  let taskmem = this.memory.task;
  if(taskmem && taskmem.task !== name) {
    console.log("BAD TASK", name, JSON.stringify(this.memory));
    delete this.memory.task;
    taskmem = undefined;
  }

  if(taskmem && obj) {
    if(taskmem.id !== obj.id) {
      return false;
    }
    return obj;
  }

  if(taskmem) {
    obj = Game.getObjectById(taskmem.id);
    if(!obj) {
      delete this.memory.task;
      return false;
    }
  }

  if(_.isString(obj)) obj = Game.getObjectById(obj);

  if(!obj || !obj.id) return false;

  this.memory.task = {
    task: name,
    id: obj.id,
  };
  return obj;
};

Creep.prototype.taskUpgradeController = function(controller) {
  controller = this.taskify("updgrade controller", controller);
  if(!controller || !controller.my) return false;

  if (!this.carry.energy) {
    return this.actionRecharge(undefined, controller.pos);
  }
  return this.doUpgradeController(controller);
};

Creep.prototype.preNom = function() {
  if(!this.carryFree) return;

  const src = _(this.room.find(FIND_DROPPED_RESOURCES))
                  .filter(e => e.pos.isNearTo(this))
                  .sample();
  if (src) {
    const err = this.pickup(src);
    if (err == OK) {
      this.say('Nom');
    } else {
      this.dlog('BAD Nom', err);
    }
  }
};

Creep.prototype.postPump = function() {
  if(this.carryFree < this.carry.energy) return;

  if(this.intents.withdraw) return;

  let pump = this.memory.pump;
  if(!pump) {
    pump = this.memory.pump = {};
  }
  let p = RoomPosition.FromMemory(pump.pos);
  if(!p || p.isEqualTo(this.pos)) {
    p = pump.pos = this.pos;
    pump.when = Game.time;
  }
  if(pump.when < Game.time) {
    if(pump.id === false) return;

    let target = Game.getObjectById(pump.id);
    if(!target) {
      target = _.find(this.room.findStructs(STRUCTURE_LINK, STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL),
          s => this.pos.isNearTo(s));
    }

    if(!target) pump.id = false;

    if(target) {
      this.intents.withdraw = target;
      const err = this.withdraw(target, RESOURCE_ENERGY);
      if(err !== OK) {
        pump.id = false;
      }
    }
  }
};
