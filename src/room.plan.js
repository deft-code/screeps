const lib = require('lib');

const MAX = 50;
const ROOM_MAX = 20;

module.exports = () => {
  if(Game.cpu.bucket < 10000) {
    console.log('skip room plans');
    return;
  }

  const rooms = _.shuffle(_.keys(Game.rooms));
  for(const name of rooms) {
    Game.rooms[name].runFlags();
  }

  const nsites = _.size(Game.constructionSites);
  if(nsites > MAX) {
    console.log(`${nsites} is too many sites`);
    return;
  }

  for(const name of rooms) {
    Game.rooms[name].runPlan();
  }
};

class Planner {
  dupPlan(p, stype) {
    if(!this.memory.plans) this.memory.plans = {};
    if(!this.memory.plans[stype]) this.memory.plans[stype] = [];
   return _.any(this.memory.plans[stype], pos => pos.x === p.x && pos.y === p.y);
  }

  addPlan(p, stype) {
    if(!this.memory.plans) this.memory.plans = {};
    if(!this.memory.plans[stype]) this.memory.plans[stype] = [];
    this.memory.plans[stype].push(p);
  }

  drawPlans(color) {
    for(const stype in this.memory.plans) {
      for(const plan of this.memory.plans[stype]) {
        const [x, y] = [plan.x, plan.y];
        this.room.visual.circle(x, y, {radius: 0.3, fill: color});
        this.room.visual.text(stype[0], x, y);
      }
    }
  }
}

lib.merge(Flag, Planner);
lib.merge(Room, Planner);

class FlagTemplate {
  setTemplate() {
    for(const stype in this.memory.plans) {
      for(const plan of this.memory.plans[stype]) {
        this.room.addPlan(plan, stype);
      }
    }
    delete this.memory.plans;
    this.remove();
  }

  tryPlan(x, y, stype) {
    if(x<0 || x>49) return;
    if(y<0 || y>49) return;

    const looks = this.room.lookAt(x, y);
    for(const look of looks) {
      switch(look.type) {
        case LOOK_STRUCTURES:
          return;
          // TODO this might makes sense later.
          const s = look[LOOK_STRUCTURES];
          if(s.obstacle) return;
          if(s.structureType === stype) return;
          break;
        case LOOK_CONSTRUCTION_SITES: return;
        case LOOK_TERRAIN:
          if(look[LOOK_TERRAIN] === 'wall') return;
          break;
        default:
          console.log(this, 'Unexpected look', look.type);
          break;
      }
    }
    const p = this.room.getPositionAt(x, y);
    if(this.room.dupPlan(p, stype)) return;
    this.addPlan(p, stype);
  }

  runTemplate() {
    this.templatePosCheck();
    if(!this.memory.plans) {
      const t = _.first(_.words(this.name)).toLowerCase();
      switch(t) {
        case 'extn':
          this.templateExtn();
          break;
        case 'labr':
          this.templateLabR();
          break;
        case 'labl':
          this.templateLabL();
          break;
        default:
          console.log(`${this} bad template ${t}`);
          break;
      }
    }
    this.drawPlans('blue');
  }

  templatePosCheck() {
    const oldpos = lib.roomposFromMem(this.memory.pos);
    if(!this.pos.isEqualTo(oldpos)) {
      delete this.memory.plans;
    }
    this.memory.pos = this.pos;
  }

  templateLabR() {
    const [x, y] = [this.pos.x, this.pos.y];

    this.tryPlan(x+0, y+3, STRUCTURE_ROAD);
    this.tryPlan(x+1, y+2, STRUCTURE_ROAD);
    this.tryPlan(x+2, y+1, STRUCTURE_ROAD);
    this.tryPlan(x+3, y+0, STRUCTURE_ROAD);

    this.tryPlan(x+0, y+1, STRUCTURE_LAB);
    this.tryPlan(x+0, y+2, STRUCTURE_LAB);
    this.tryPlan(x+1, y+3, STRUCTURE_LAB);
    this.tryPlan(x+2, y+3, STRUCTURE_LAB);

    this.tryPlan(x+1, y+0, STRUCTURE_LAB);
    this.tryPlan(x+1, y+1, STRUCTURE_LAB);
    this.tryPlan(x+2, y+0, STRUCTURE_LAB);

    this.tryPlan(x+2, y+2, STRUCTURE_LAB);
    this.tryPlan(x+3, y+1, STRUCTURE_LAB);
    this.tryPlan(x+3, y+2, STRUCTURE_LAB);
  }

  templateLabL() {
    const [x, y] = [this.pos.x, this.pos.y];

    this.tryPlan(x+0, y+3, STRUCTURE_ROAD);
    this.tryPlan(x+1, y+2, STRUCTURE_ROAD);
    this.tryPlan(x+2, y+1, STRUCTURE_ROAD);
    this.tryPlan(x+3, y+0, STRUCTURE_ROAD);

    this.tryPlan(x-0, y+1, STRUCTURE_LAB);
    this.tryPlan(x-0, y+2, STRUCTURE_LAB);
    this.tryPlan(x-1, y+3, STRUCTURE_LAB);
    this.tryPlan(x-2, y+3, STRUCTURE_LAB);

    this.tryPlan(x-1, y+0, STRUCTURE_LAB);
    this.tryPlan(x-1, y+1, STRUCTURE_LAB);
    this.tryPlan(x-2, y+0, STRUCTURE_LAB);

    this.tryPlan(x-2, y+2, STRUCTURE_LAB);
    this.tryPlan(x-3, y+1, STRUCTURE_LAB);
    this.tryPlan(x-3, y+2, STRUCTURE_LAB);
  }

  templateExtn() {
    const roads = this.room.findStructs(STRUCTURE_ROAD).concat(
      _.filter(this.room.find(FIND_MY_CONSTRUCTION_SITES),
        c => c.structureType === STRUCTURE_ROAD));

    for(let dx=-3; dx<=3; dx++) {
      const x = this.pos.x + dx;
      if(x<0 || x>49) continue;
      for(let dy=-3; dy<=3; dy++) {
        const y = this.pos.y + dy;
        if(y<0 || y>49) continue;
        const p = this.room.getPositionAt(x, y);
        const r = p.findClosestByRange(roads);
        if(!p.isNearTo(r)) continue;
        this.tryPlan(x, y, STRUCTURE_EXTENSION);
      }
    }
  }
}

lib.merge(Flag, FlagTemplate);

class RoomPlan {
  runFlags() {
    if(!this.base) return;
    if(!this.memory.plans) this.memory.plans = {};

    const flags = _.filter(
      this.find(FIND_FLAGS),
      f => f.color === COLOR_ORANGE);
    for(const flag of flags) {
      console.log("planning", flag);
      switch(flag.secondaryColor) {
        case COLOR_PURPLE:
          this.addPlan(flag.pos, flag.name);
          flag.remove();
          break;
        case COLOR_BLUE:
          flag.runTemplate();
          break;
        case COLOR_WHITE:
          flag.setTemplate();
          break;
      }
    }
  }


  runPlan() {
    if(this.base) this.planBase();
  }

  allPlans() {
    return _.flatten(
      _.map(this.memory.plans,
        (poss, stype) => _.map(poss, pos => ({structureType: stype, pos: pos}))));
  }

  growRoads() {
    const srcs = this.find(FIND_SOURCES);
    switch(Game.time % 4) {
      case 0:
        this.growRoad(_.first(srcs), this.controller, 3, true);
        break;
      case 1:
        this.growRoad(_.last(srcs), this.controller, 3, true);
        break;
      case 2:
        this.growRoad(_.first(srcs), _.last(srcs), 1, true);
        break;
      case 3:
        const spawn = _.sample(this.findStructs(STRUCTURE_SPAWN));
        const ramp = _.sample(this.findStructs(STRUCTURE_RAMPART));
        this.growRoad(spawn, ramp, 3, true);
        break;
    }
  }

  growRoad(orig, dest, range, trunc) {
    if(!orig || !dest) return false;

    let path = this.planRoad(orig, dest, range);
    let start = 0;
    let end = path.length;
    if(trunc) {
      if(path.length < 3) return;
      start++;
      end--;
    }

    for(;start<end; start++) {
      const err = this.createConstructionSite(path[start], STRUCTURE_ROAD);
      if(err === OK) break;
    }

    end--; // fix off by one
    for(;start<end; end--) {
      const err = this.createConstructionSite(path[end], STRUCTURE_ROAD);
      if(err === OK) break;
    }
  }

  planRoad(orig, dest, range) {
    if(!orig || !dest) return;
    const addStructs = (mat, structs) => {
      for (const struct of structs) {
        const p = struct.pos;
        if (struct.structureType === STRUCTURE_ROAD) {
          mat.set(p.x, p.y, 2);
        } else if (_.contains(OBSTACLE_OBJECT_TYPES, struct.structureType)) {
          mat.set(p.x, p.y, 255);
        }
      }
    };
    const callback = (roomName) => {
      if (roomName !== this.name) {
        console.log('Unexpected room', roomName);
        return false;
      }
      const mat = new PathFinder.CostMatrix();
      addStructs(mat, this.find(FIND_CONSTRUCTION_SITES));
      addStructs(mat, this.find(FIND_STRUCTURES));
      addStructs(mat, this.allPlans());
      return mat;
    };
    const ret = PathFinder.search(orig.pos, {pos: dest.pos, range: range}, {
      plainCost: 3,
      swampCost: 4,
      maxRooms: 1,
      roomCallback: callback,
    });
    this.visual.poly(ret.path);
    return ret.path;
  }

  planBase() {
    for(const stype in this.memory.plans) {
      for(const plan of this.memory.plans[stype]) {
        const [x, y] = [plan.x, plan.y];
        this.visual.circle(x, y, {radius: 0.3, fill: 'orange'});
        this.visual.text(stype[0], x, y);
      }
    }

    const sites = this.find(FIND_MY_CONSTRUCTION_SITES);
    if(sites.length > ROOM_MAX) {
      console.log(`${sites.length} is too many sites for ${this}`);
      return;
    }

    let extra = 1000000;
    if(this.myStorage)  {
      const ongoing = _.sum(sites, site => site.progressTotal - site.progress);
      extra = this.storage.store.energy - ongoing;
      if(extra <= 0) {
        return;
      }
    }


    this.growRoads();

    const level = this.controller.level;
    for(const stype in this.memory.plans) {
      if(!this.memory.plans[stype].length) continue;
      if(CONSTRUCTION_COST[stype] > extra) continue;

      let skip = false;
      switch(stype) {
        case STRUCTURE_EXTRACTOR:
        case STRUCTURE_LAB:
          skip = !this.terminal;
          break;
        case STRUCTURE_RAMPART:
        case STRUCTURE_WALL:
          skip = !this.findStructs(STRUCTURE_TOWER).length;
          break;
      }

      if(skip) continue;

      let count = this.findStructs(stype).length;
      count += _.filter(this.find(FIND_MY_CONSTRUCTION_SITES), s => s.structureType === stype).length;
      const needs = CONTROLLER_STRUCTURES[stype][level];
      if(count >= needs) continue;

      let plans = _.map(this.memory.plans[stype], lib.roomposFromMem);
      if(stype === STRUCTURE_EXTENSION && this.myStorage) {
        const anchor = this.storage || _.first(this.findStructs(STRUCTURE_SPAWN));
        plans = _.sortBy(plans, plan => -anchor.pos.getRangeTo(plan));
      }

      const plan = plans.pop();
      this.memory.plans[stype] = plans;

      const [x, y] = [plan.x, plan.y];
      const err = this.createConstructionSite(x, y, stype);
      switch(err) {
        case ERR_INVALID_TARGET:
          console.log(`${this} removed plan for ${stype}, ${x}, ${y}`);
          break;
        case OK:
          console.log(`${this} created site for ${stype}, ${x}, ${y}`);
          break;
        default:
          console.log(`ERROR: ${this} unexpected site error ${err}: ${stype}, ${x}, ${y}`);
          break;
      }
    }
  }
}

lib.merge(Room, RoomPlan);
