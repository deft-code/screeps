const shed = require('shed');

const MAX = MAX_CONSTRUCTION_SITES / 2;
const ROOM_MAX = MAX / 2;

Room.prototype.baseUpkeep = function() {
  if(!this.controller) return;
  if(!this.contoller.my) return;

  this.layouter = new Layouter(this.name);
  layout.run();
};

class Layouter {
  constructor(name) {
    this.name = name;
  }

  get room() {
    return Game.rooms[this.name];
  }

  get memory() {
    return this.room.memory.layout = this.room.memory.layout || {};
  }

  get mine() {
    if(!this.memory.mine) {
      this.pickMine();
    }
    return this.memory.mine;
  }

  get core() {
    if(!this.memory.core) {
      this.pickCore();
    }
    return this.memory.core;
  }

  get aux() {
    if(!this.memory.aux) {
      this.pickAux();
    }
    return this.memory.aux;
  }

  get ctrl() {
    if(!this.memory.ctrl) {
      this.pickCtrl();
    }
    return this.memory.ctrl;
  }

  get extns() {
    return this.memory.extns = this.memory.extns || [];
  }

  run() {
    if(shed.low()) return;

    const nsites = _.size(Game.constructionSites);
    if(nsites > MAX) {
      console.log(`${nsites} is too many sites`);
      return false;
    }

    const sites = this.find(FIND_MY_CONSTRUCTION_SITES);
    if(sites.length > ROOM_MAX) {
      return false;
    }

    const level = this.room.controller.level;

    this.upkeepTower(this.core, 1) &&
    this.upkeep(this.core, STRUCTURE_SPAWN) &&
    this.upkeepTower(this.core, 3) &&
    this.upkeepTower(this.aux, 1) &&
    this.upkeepTower(this.min, 2) &&
    this.upkeepExtns() &&
    level >= 3 &&
    this.upkeep(this.aux, STRUCTURE_CONTAINER) &&
    this.upkeep(this.ctrl, STRUCTURE_CONTAINER) &&
    this.upkeepRampart(this.core.pos) &&

    level >= 4 &&
    this.upkeep(this.core, STRUCTURE_STORAGE) &&

    level >= 5 &&
    this.upkeep(this.aux, STRUCTURE_LINK) &&
    this.upkeep(this.ctrl, STRUCTURE_LINK) &&
    this.upkeepRampart(...this.aux.pos) &&

    level >= 6 &&
    this.upkeep(this.mine, STRUCTURE_TERMINAL) &&
    this.upkeepExtractor() &&
    this.upkeep(this.core, STRUCTURE_LINK) &&
    this.rmCont(this.aux) &&
    this.upkeepLabs(6) &&

    level >= 7 &&
    this.upkeep(this.mine, STRUCTURE_SPAWN) &&
    this.upkeep(this.mine, STRUCTURE_LINK) &&
    this.upkeepRampart(this.mine.pos) &&

    level >= 8 &&
    this.rmCont(this.ctrl) &&
    this.upkeep(this.mine, STRUCTURE_SPAWN) &&
    this.upkeepOne(STRUCTURE_OBSERVER) &&
    this.upkeepOne(STRUCTURE_NUKER) &&
    this.upkeepOne(STRUCTURE_POWER_SPAWN);

    this.planExtns();
  }

  get cost() {
    if(!this._cost) {
      this._cost = _.sum(this.room.find(FIND_MY_CONSTRUCTION_SITES),
        site => site.progressTotal - site.progress);
    }
    return this._cost;
  }

  afford(stype) {
    if(!this.room.storage) return true;
    return this.room.storage.energy > this.cost + CONSTRUCTION_COST[stype];
  }

  mkSite(x, y, stype) {
    if(!this.afford(stype)) {
      this.room.visual.circle(x, y, {radius: 0.3, fill: 'green'});
      return false;
    }

    const err = this.room.createConstructionSite(x, y, stype);
    if(err !== OK) {
      debug.log("Failed to create construction site:", err, x, y, stype);
    }
    // Return false on OK so only one site per tick.
    // return false on other errors as well.
    // RCL not enough means there are enough sites/structs
    return err === ERR_RCL_NOT_ENOUGH;
  }

  rmCont(who) {
    const c = lib.lookup(who[STRUCTURE_CONTAINER]);
    if(c) {
      c.destroy();
      who[STRUCTURE_CONTAINER] = false;
      return false;
    }
    return true;
  }

  pickSite(x, y) {
    let sites = [];
    for(let dx = -1; dx <= 1; dx++) {
      for(let dy = -1; dy <= 1; dy++) {
        if(dx===0 && dy===0) continue;
        const xx = x+dx;
        const yy = y+dy;
        if(Game.map.getTerrainAt(xx, yy) === 'wall') continue;
        const ats = this.room.lookForAt(LOOK_STRUCTURES, xx, yy);
        const taken = _.any(ats, s => !_.contains([STRUCTURE_ROAD, STRUCTURE_RAMPART], s.structureType));
        if(taken) continue;
        sites.push(this.room.getPositionAt(xx, yy));
      }
    }

    if(sites.length < 2) return null;

    return _.sample(sites);
  }

  plan(who, stype) {
    if(who[stype] === false) return null;

    if(_.isString(who[stype])) {
      const o = lib.lookup(who[stype]);
      if(o) return o.pos;
      delete who[stype];
    }

    if(_.isArray(who[stype])) {
      const [x, y] = who[stype];
      const structs = this.room.lookForAt(LOOK_STRUCTURES, x, y);
      const struct = _.find(structs, s => s.structureType === stype);
      if(struct) {
        who[type] = struct.id;
        return struct.pos;
      }

      const sites = this.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
      const site = _.find(sites, s => s.structureType === stype);
      if(site) {
        who[type] = site.id;
        return site.pos;
      }

      return this.room.getPositionAt(x, y);
    }

    const [x, y] = who.pos;
    const lstructs = this.rooms.lookForAtArea(LOOK_STRUCTURES, y-1, x-1, y+1, x+1, true);
    const lstruct = _.find(lstructs, look => look[LOOK_STRUCTURES].structureType === stype);
    if(lstruct) {
      who[stype] = lstruct[LOOK_STRUCTURES].id;
      return lstruct[LOOK_STRUCTURES].pos;
    }

    const lsites = this.rooms.lookForAtArea(LOOK_CONSTRUCTION_SITES, y-1, x-1, y+1, x+1, true);
    const lsite = _.find(lsites, look => look[LOOK_CONSTRUCTION_SITES].structureType === stype);
    if(lsite) {
      who[stype] = lsite[LOOK_CONSTRUCTION_SITES].id;
      return lsite[LOOK_CONSTRUCTION_SITES].pos;
    }

    if(stype === STRUCTURE_CONTAINER) {
      who[stype] = who.pos;
      return this.room.getPositionAt(...who.pos);
    }

    const p = this.pickSite(...who.pos);
    if(p) {
      who[stype] = [p.x, p.y];
    } else {
      who[stype] = false;
    }
    return p;
  }

  upkeep(who, stype) {
    const p = this.plan(who, stype);
    if(!p) return true;

    const s = lib.lookup(who[stype]);
    if(!s) {
      return this.mkSite(p.x, p.y, stype);
    }

    if(s instanceof Structure) {
      if(_.contains([STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL], stype)) {
        return this.upkeepRampart(p.x, p.y);
      }
    }
    return true;
  }

  upkeepRampart(x, y) {
    const structs = this.room.lookForAt(LOOK_STRUCTURES, x, y)
    const rampart = _.any(structs, s => s.structureType === STRUCTURE_RAMPART);
    if(!rampart) {
      return this.mkSite(x, y, STRUCTURE_RAMPART);
    }
    return true;
  }

  upkeepTower(who, n) {
  }

  upkeepExtractor() {
    if(this.room.findStructs(STRUCTURE_EXTRACTOR).length) return;

    const mineral = _.first(this.room.find(FIND_MINERALS));
    return this.mkSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
  }

  upkeepLabs(level) {
    const max = CONTROLLER_STRUCTURES[STRUCTURE_LAB][level]
    const n = this.count(STRUCTURE_LAB);
    if(n >= max) return true;

    const labs = this.memory.labs = this.memory.labs || {};

    // Labs not set up yet.
    if(!labs.pos) return true;

    const [x, y] = labs.pos;
    const extra = labs.left? 1: 0;

    this.upkeepAt(x, y - extra, STRUCTURE_ROAD) &&
    this.upkeepAt(x+1, y - 1 + extra, STRUCTURE_ROAD) &&
    this.upkeepAt(x-1, y, STRUCTURE_LAB) &&
    this.upkeepAt(x-1, y-1, STRUCTURE_LAB) &&
    this.upkeepAt(x, y+1, STRUCTURE_LAB) &&
    this.upkeepAt(x+1, y+1, STRUCTURE_LAB) &&
    this.upkeepAt(x, y - 1 + extra, STRUCTURE_LAB) &&
    this.upkeepAt(x+1, y - extra, STRUCTURE_LAB) &&
    this.upkeepAt(x+2, y, STRUCTURE_LAB) &&
    this.upkeepAt(x+2, y-1, STRUCTURE_LAB) &&
    this.upkeepAt(x, y-2, STRUCTURE_LAB) &&
    this.upkeepAt(x+1, y-2, STRUCTURE_LAB);
  }

  upkeepAt(x, y, stype) {
    const structs = this.room.lookForAt(LOOK_STRUCTURES, x, y);
    for(const struct of structs) {
      if(struct.structureType === stype) return true;
      this.room.visual.circle(x, y, {radius: 0.3, fill: 'red'});
      return false;
    }
    const sites = this.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
    for(const site of sites) {
      if(struct.structureType !== stype) {
        this.room.visual.circle(x, y, {radius: 0.3, fill: 'red'});
      }
      return false;
    }
    return this.mkSite(x, y, stype);
  }

  upkeepOne(stype) {
    const structs = this.room.findStructs(stype);
    if(structs.length) {
      const p = structs[0].pos;
      this.memory[stype] = [p.x, p.y];
      return true;
    }

    const s = _.find(this.room.find(FIND_MY_CONSTRUCTION_SITES),
      s => s.structureType === stype);
    if(s) {
      const p = s.pos;
      this.memory[stype] = [p.x, p.y];
      return false;
    } else if (_.isArray(this.memory[stype])) {
      return this.mkSite(x, y, stype);
    }
    // No known location, skip it.
    return true;
  }

  count(stype) {
    return this.room.findStructs(STRUCTURE_EXTENSION).length +
      _.size(_.filter(this.room.find(FIND_MY_CONSTRUCTION_SITES),
        s => s.structureType === stype));
  }

  upkeepExtns(level) {
    const max = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level]
    const n = this.count(STRUCTURE_EXTENSION);
    if(n >= max) return true;

    if(!this.afford(STRUCTURE_EXTENSION)) return false;

    while(this.extns.length<2) {
      const x = this.extns[0];
      const y = this.extns[1];
      this.extns = this.extns.slice(2);
      if(this.validExtn(x, y)) {
        return this.mkSite(x, y, STRUCTURE_EXTENSION);
      }
    }
    return false;
  }

  validExtn(x, y) {
    if(x <= 0 || x >= 49) return false;
    if(y <= 0 || y >= 49) return false;

    if(Game.map.getTerrainAt(x, y, this.room.name) === 'wall') return false;
    if(this.room.lookForAt(LOOK_STRUCTURES, x, y).length) return false;

    const looks = this.room.lookForAtArea(LOOK_STRUCTURES, y-1, x-1, y+1, x+1, true);
    let road = false;
    for(const look of looks) {
      const stype = look[LOOK_STRUCTURES].structureType;
      switch(stype) {
        case STRUCTURE_ROAD: road = true; break;
        case STRUCTURE_EXTENSION: break;
        default: return false;
      }
    }
    if(!road) return false;

    const pos = room.getPositionAt(x, y);
    const exit = pos.findClosestByRange(FIND_EXIT);
    if(pos.getRangeTo(exit) <= 3) return false;

    const wall = pos.findClosestByRange(this.room.findStructs(STRUCTURE_WALL));
    if(pos.getRangeTo(wall) <= 2) return false;

    return true;
  }

  planExtns() {
    if(shed.low()) return;

    let maxExtns = 20;
    if(this.room.controller.level === 8) {
      const max = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][this.room.controller.level];
      const n = this.count(STRUCTURE_EXTENSION);
      const l = max - n;
      maxExtns = 2 * l;

      if(this.extns.length > maxExtns) {
        this.memory.extns = this.extns.slice(0, maxExtns);
      }
    }

    if(this.extns.length >= maxExtns) return;

    const pos = this.plan('core', STRUCTURE_STORAGE);
    const px = pos.x;
    const py = pos.y;

    for(let r = 3; r<40; r++) {
      let x = px - r;
      for(let i = 0; i < 2*r; i++) {
        const y = py - r + i;
        if(this.validExtn(x, y)) {
          this.memory.extns.push(x);
          this.memory.extns.push(y);
          return 
        }
      }

      let y = py + r;
      for(let i = 0; i < 2*r; i++) {
        const x = px - r + i;
        if(this.validExtn(x, y)) {
          this.memory.extns.push(x);
          this.memory.extns.push(y);
          return 
        }
      }

      x = px + r;
      for(let i = 0; i < 2*r; i++) {
        const y = py + r - i;
        if(this.validExtn(x, y)) {
          this.memory.extns.push(x);
          this.memory.extns.push(y);
          return 
        }
      }

      y = py - r;
      for(let i = 0; i < 2*r; i++) {
        const x = px + r - i;
        if(this.validExtn(x, y)) {
          this.memory.extns.push(x);
          this.memory.extns.push(y);
          return 
        }
      }
    }
  }
};
