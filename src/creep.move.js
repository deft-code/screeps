const lib = require('lib');
const util = require('util');

class CreepMove {
  idleMove(dir) {
    return this.moveHelper(this.move(dir), dir);
  }

  idleMoveTo(target, opts = {}) {
    const weight = this.weight;
    const fatigue = this.bodyInfo().fatigue;
    this.dlog('doMoveTo', weight, fatigue, target);

    const routeCB = (roomName) => {
      switch(roomName) {
        case 'W76S52':
        case 'W76S56':
        case 'W77S52':
        case 'W77S56':
        case 'W78S52':
        case 'W79S55':
        case 'W79S58':
          return 20;
      }
      return;
    }

    opts = _.defaults(opts, {
      // useFindRoute: true,
      ignoreRoads: fatigue > weight,
      routeCallback: routeCB,
    });
    return this.moveHelper(this.travelTo(target, opts), lib.getPos(target));
  }

  moveHelper(err, intent) {
    switch (err) {
      case ERR_TIRED:
      case ERR_BUSY:
        this.say(util.errString(err));
        // fallthrough
      case OK:
        this.intents.move = intent;
        return `move ${intent}`;
    }
    return false;
  }

  idleFlee(creeps, range) {
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

    return this.idleMove(this.pos.getDirectionTo(next));
  }

  idleAway(creep) {
    if (!creep) return false;
    return this.idleMove(this.pos.getDirectionAway(creep));
  }

  idleRetreat(part) {
    if (this.getActiveBodyparts(part)) {
      return false;
    }
    return this.idleMoveRange(this.home.controller);
  }

  actionHospital() {
    if (this.hurts > 100 || this.hits < 100) {
      return this.idleMoveRange(this.home.controller);
    }
    return false;
  }

  idleMoveRoom(obj, opts={}) {
    if (!obj) return false;
    const p = this.pos;
    if (obj.pos.roomName === p.roomName && p.x > 1 && p.x < 48 && p.y > 1 &&
        p.y < 48) {
      return false;
    }
    return this.idleMoveTo(obj, opts);
  }

  idleMoveNear(target, opts = {}) {
    opts = _.defaults(opts, {range: 1});
    if (!target || this.pos.inRangeTo(target, opts.range)) return false;

    return this.idleMoveTo(target, opts);
  }

  idleMoveRange(target, opts = {}) {
    opts = _.defaults(opts, {range: 3});
    if (!target || this.pos.inRangeTo(target, opts.range)) return false;

    return this.idleMoveTo(target, opts);
  }

  taskMoveRoom(obj) {
    obj = this.checkId('move room', obj);
    return this.idleMoveRoom(obj);
  }

  taskMoveFlag(flag, opts={}) {
    flag = this.checkFlag('move flag', flag);
    return this.idleMoveRoom(flag, opts);
  }
}

lib.merge(Creep, CreepMove);
