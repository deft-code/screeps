const lib = require('lib');
const util = require('util');

class CreepMove {
  idleOffRoad() {
    if(this.intents.move) return false;
    if(this.fatigue) return false;

    if(this.memory.offroad) {
      const offroad = lib.roomposFromMem(this.memory.offroad);
      if(this.pos.isEqualTo(offroad)) {
        return false;
      }
      delete this.memory.offroad;
    }

    const stuff = this.room.lookForAt(LOOK_STRUCTURES, this);
    if(!_.any(stuff, s => s.structureType === STRUCTURE_ROAD)) {
      this.memory.offroad = this.pos;
    }

    const offset = Math.floor(Math.random()*8);
    for(const d = TOP; dir <= TOP_LEFT; dir++) {
      const dir = (d + offset) % TOP_LEFT;
      const pos = this.pos.atDirection(dir);
      if(pos.exit) continue;

      const spots = this.room.lookAt(pos);
      const badSpot = (spot) => {
        switch(spot.type) {
          case LOOK_TERRAIN:
            return spot[LOOK_TERRAIN] === 'wall';
          case LOOK_STRUCTURES:
            const struct = spot[LOOK_STRUCTURES];
            return struct.obstacle || struct.structureType === STRUCTURE_ROAD;
          case LOOK_CREEPS:
          case LOOK_CONSTRUCTION_SITES:
            return true;
        }
        return false;
      };
      if(_.any(spots, badSpot)) continue;

      return this.moveDir(dir);
    }
  }

  moveDir(dir) {
    return this.moveHelper(this.move(dir), dir);
  }

  movePos(target, opts = {}) {
    opts = _.defaults(opts, {range: 0});
    return this.moveTarget(target, opts);
  }

  moveNear(target, opts = {}) {
    opts = _.defaults(opts, {range: 1});
    return this.moveTarget(target, opts);
  }

  moveRange(target, opts = {}) {
    opts = _.defaults(opts, {range: 3});
    const what = this.moveTarget(target, opts);
    this.dlog(`moveRange ${what}`);
    return what;
  }

  moveTarget(target, opts = {}) {
    if (!target || this.pos.inRangeTo(target, opts.range)) return false;

    const weight = this.weight;
    const fatigue = this.info.fatigue;
    this.dlog('moveTarget', weight, fatigue, target);

    const routeCB = (roomName) => {
      switch(roomName) {
        case 'W83S86':
        case 'W88S84':
          return 10;
      }
      return undefined;
    };

    opts = _.defaults(opts, {
      ignoreRoads: fatigue > weight,
      allowHostile: true,
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

  movePeace(target) {
    if(this.room.memory.tenemies) return false;
    return this.moveRange(target);
  }

  moveBump(target) {
    if(!target || !this.pos.isNearTo(target)) return false;
    this.moveDir(this.pos.getDirectionTo(target));
  }

  fleeHostiles() {
    if(!this.room.hostiles.length) return false;

    if(this.hurts) return this.idleFlee(this.room.hostiles, 5);

    return this.idleFlee(this.room.hostiles, 3);
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
      for(let pos of room.find(FIND_EXIT)) {
        mat.set(pos.x, pos.y, 6);
      }
      for(let creep of room.find(FIND_CREEPS)) {
        if(creep.name === this.name) continue;
        mat.set(creep.pos.x, creep.pos.y, 20);
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

    return this.moveDir(this.pos.getDirectionTo(next));
  }

  idleAway(creep) {
    if (!creep) return false;
    return this.moveDir(this.pos.getDirectionAway(creep));
  }

  idleRetreat(part) {
    if(!this.partsByType[part]) return false;
    if(this.activeByType[part]) return false;
    this.dlog("retreating");
    return this.moveRange(this.home.controller);
  }

  actionHospital() {
    if (this.hurts > 100 || this.hits < 100) {
      return this.moveRange(this.home.controller);
    }
    return false;
  }

  idleMoveRoom(obj, opts={}) {
    if (!obj) return false;
    const x = this.pos.x;
    const y = this.pos.y;
    this.dlog("idleMoveRoom", obj.pos.roomName, this.pos.roomName);
    if (obj.pos.roomName === this.pos.roomName) {
      if(x === 0) {
        this.moveDir(RIGHT);
      } else if (x === 49) {
        this.moveDir(LEFT);
      } else  if(y === 0) {
        this.moveDir(BOTTOM);
      } else if (y === 49) {
        this.moveDir(TOP);
      }
      this.dlog("idleMoveRoom done");
      return false;
    }
    const range = Math.min(x, y, 49-x, 49-y);
    opts = _.defaults(opts, {range: range});
    return this.moveTarget(obj, opts);
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
