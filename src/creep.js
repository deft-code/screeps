const lib = require('lib');
const util = require('util');

class CreepExtra {
  get home() {
    return Game.rooms[this.memory.home] || Game.spawns[this.memory.spawn];
  }

  get team() {
    return Game.flags[this.memory.team];
  }

  get atTeam() {
    return this.room.name === this.team.pos.roomName;
  }

  get atHome() {
    return this.room.name === this.memory.home;
  }

  get teamRoom() {
    return this.team && this.team.room;
  }

  get partsByType() {
    if(!this._partsByType) {
      this._partsByType = _(this.body)
        .countBy('type')
        .value();
    }
    return this._partsByType;
  }

  get activeByType() {
    if(!this._activeByType) {
      this._activeByType = _(this.body)
        .filter('hits')
        .countBy('type')
        .value();
    }
    return this._activeByType;
  }

  get info() {
    if(!this.hurts) {
      return this.fullInfo;
    }
    if(this._info) {
      return this._info;
    }
    return this._info = this.bodyInfo();
  }

  get fullInfo() {
    if(this.name) {
      let info = this.memory.info;
      if(!info) {
        info = this.memory.info = this.bodyInfo(true);
      }
      return info;
    }
    if(this._fullInfo) {
      return this._fullInfo;
    }
    return this._fullInfo = this.bodyInfo(true);
  }

  get ignoreRoads() {
    return this.body.length >= 2 * this.getActiveBodyparts(MOVE);
  }

  get melee() {
    return this.activeByType[ATTACK];
  }

  get ranged() {
    return this.activeByType[RANGED_ATTACK];
  }

  get hostile() {
    return this.melee || this.ranged;
  }

  get assault() {
    return this.hostile || this.activeByType[WORK] > 1;
  }

  run() {
    if (this.spawning) {
      this.memory.home = this.room.name;
      this.memory.cpu = 0;
      return 'spawning';
    }

    const start = Game.cpu.getUsed();
    this.intents = {};

    const role = _.camelCase('role ' + this.memory.role);
    const roleFunc = this[role] || this.roleUndefined;
    const what = roleFunc.apply(this);

    const after = _.camelCase('after ' + this.memory.role);
    const afterFunc = this[after] || this.afterUndefined;
    if (_.isFunction(afterFunc)) afterFunc.apply(this);

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
  }
}

lib.merge(Creep, CreepExtra);
