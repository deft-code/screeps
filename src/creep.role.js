const lib = require('lib');
const debug = require('debug');

class CreepRole {
  roleUndefined() {
    console.log(`${this} Missing Role! ${JSON.stringify(this.memory)}`);
  }

  roleIndex() {
    return _.findIndex(
        this.team.roleCreeps(this.memory.role), rc => rc.name === this.name);
  }

  roleRecycle() {
    return this.idleRecycle();
  }

  idleRecycle() {
    const spawn = Game.spawns[this.memory.spawn];
    if(!spawn) {
      console.log("BAD spawn", this.memory.spawn);
      return false;
    }

    const err = spawn.recycleCreep(this);
    if(err === ERR_NOT_IN_RANGE) {
      return this.moveNear(spawn);
    }
    console.log(`RECYCLE! ${err}, ${this}, ${spawn}`);
    return false;
  }

  checkMem(name) {
    let mem = this.memory.task;
    if (mem && mem.task !== name) {
      delete this.memory.task;
      mem = undefined;
    }
    return mem;
  }

  checkFlag(name, flag) {
    if (_.isString(flag)) flag = Game.flags[flag];

    if (flag) {
      this.memory.task = {
        task: name,
        flag: flag.name,
        first: flag.pos,
      };
      return flag;
    }

    const mem = this.checkMem(name);
    if (mem) {
      flag = Game.flags[this.memory.task.flag];
      if (!flag) return false;
      if (this.debug && this.pos.roomName === flag.pos.roomName) {
        this.room.visual.line(this.pos, flag.pos, {lineStyle: 'dotted'});
      }
      return flag;
    }

    return false;
  }

  checkId(name, obj) {
    if (_.isString(obj)) obj = Game.getObjectById(obj);

    if (obj) {
      this.memory.task = {
        task: name,
        id: obj.id,
        first: obj.pos,
      };
      this.dlog(`start ${name} ${obj}`);
      return obj;
    }

    // This prevents accidental repeats.
    if(obj !== undefined) return false;

    const mem = this.checkMem(name);
    if (mem) {
      obj = Game.getObjectById(this.memory.task.id);
      if (!obj) return false;

      if (this.debug && this.pos.roomName === obj.pos.roomName) {
        this.room.visual.line(this.pos, obj.pos, {lineStyle: 'dotted'});
      }
      this.dlog(`again ${name} ${obj}`);
      return obj;
    }

    return false;
  }

  checkOther(name, arg) {
    if(arg) return arg;

    const tmem = this.memory.task;
    if(!tmem) return false;
    return tmem[name];
  }

  taskTask() {
    const tmem = this.memory.task;
    if (!tmem) return false;

    const fname = _.camelCase('task ' + tmem.task);
    if(fname === 'taskTask') {
      debug.log('Task Recursion');
      Game.notify('Task Recursion');
      return false;
    }
    const f = this[_.camelCase('task ' + tmem.task)];
    if (!_.isFunction(f)) return false;

    const what = f.apply(this);
    if(!what || what === 'success') {
      if(!what) {
        this.say('Done!');
      } else {
        this.say('Done');
      }
      delete this.memory.task;
    }
    return what;
  }

  arrival() {
    if(!this.memory.arrival) {
      this.memory.arrival = Game.time;
    }
  }
}

lib.merge(Creep, CreepRole);
