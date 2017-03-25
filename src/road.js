const lib = require('lib');

class Paver {
  constructor(room, count = 0) {
    this.room = room;
    this.count = count;
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    this.made = sites.length;
  }

  canRoad(p) {
    for (let entry of this.room.lookAt(p)) {
      switch (entry.type) {
        case 'creep':
          break;
        case 'terrain':
          if (entry.terrain === 'wall') {
            return false;
          }
          break;
        case 'structure':
          if (entry.structure.obstacle) return false;
          if (entry.structure.structureType === STRUCTURE_ROAD) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  unRoad(struct) {
    for (let road of struct.pos.lookFor(LOOK_STRUCTURES)) {
      if (road.structureType === STRUCTURE_ROAD) {
        if (this.made >= this.count) {
          this.room.visual.circle(road.pos, {radius: 0.5, fill: 'red'});
        } else {
          road.destroy();
        }
        this.made++;
      }
    }
  }

  layoutStruct(struct, dirs) {
    for (let dir of dirs) {
      const p = struct.pos.atDirection(dir);
      if (this.canRoad(p)) {
        if (this.made >= this.count) {
          this.room.visual.circle(p);
        } else {
          this.room.createConstructionSite(p, STRUCTURE_ROAD);
        }
        this.made++;
      }
    }
    this.unRoad(struct);
  };

  layoutRoad(from, dest, range) {
    const callback = (roomName) => {
      if (roomName !== this.room.name) {
        console.log('Unexpected room', roomName);
        return false;
      }
      const mat = new PathFinder.CostMatrix();
      for (let site of this.room.find(FIND_CONSTRUCTION_SITES)) {
        const p = site.pos;
        if (site.structureType === STRUCTURE_ROAD) {
          mat.set(p.x, p.y, 2);
        } else if (lib.structObstacle(site)) {
          mat.set(p.x, p.y, 255);
        }
      }
      for (let struct of this.room.find(FIND_STRUCTURES)) {
        const p = struct.pos;
        if (struct.structureType === STRUCTURE_ROAD) {
          mat.set(p.x, p.y, 2);
        } else if (struct.obstacle) {
          mat.set(p.x, p.y, 255);
        }
      }
      return mat;
    };
    const ret = PathFinder.search(from.pos, {pos: dest.pos, range: range}, {
      plainCost: 3,
      swampCost: 3,
      maxRooms: 1,
      roomCallback: callback,
    });
    this.room.visual.poly(ret.path);
    for (let p of ret.path) {
      if (this.canRoad(p)) {
        this.made++;
        if (this.made >= this.count) {
          this.room.visual.circle(p);
        } else {
          this.room.createConstructionSite(p, STRUCTURE_ROAD);
        }
      }
    }
  }

  layoutSpawns() {
    for (let spawn of this.room.findStructs(STRUCTURE_SPAWN)) {
      this.layoutStruct(spawn, [
        TOP, TOP_LEFT, LEFT, BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT, RIGHT, TOP_RIGHT
      ]);
      if (this.room.controller) {
        this.layoutRoad(spawn, this.room.controller, 3);
      }
      if (this.room.terminal) {
        this.layoutRoad(spawn, this.room.terminal, 1);
      }
      for (let src of this.room.find(FIND_SOURCES)) {
        this.layoutRoad(spawn, src, 1);
      }
      //for (let rampart of this.room.findStructs(STRUCTURE_RAMPART)) {
      //  this.layoutRoad(spawn, rampart, 3);
      //}
    }
  }

  layoutLinks() {
    for (let link of this.room.findStructs(STRUCTURE_LINK)) {
      if (link.mode != 'src') {
        this.layoutStruct(link, [TOP, LEFT, BOTTOM, RIGHT]);
      }
    }
  }

  layoutExtensions() {
    for (let extn of this.room.findStructs(STRUCTURE_EXTENSION)) {
      this.unRoad(extn);
    }
  }

  layoutSrcs() {
    for (let src of this.room.find(FIND_SOURCES)) {
      for (let spot of src.spots) {
        if (this.canRoad(spot)) {
          if (this.made >= this.count) {
            this.room.visual.circle(spot);
          } else {
            this.room.createConstructionSite(spot, STRUCTURE_ROAD);
          }
          this.made++;
        }
      }
    }
  }

  layoutTerminal() {
    const storage = this.room.storage;
    const mineral = _.first(this.room.find(FIND_MINERALS));
    if(storage) {
      this.layoutRoad(storage, mineral, 1);
    }

    const terminal = this.room.terminal;
    if (!terminal) return;

    this.layoutStruct(terminal, [
      TOP, TOP_LEFT, LEFT, BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT, RIGHT, TOP_RIGHT
    ]);
  }

  layoutController() {
    const controller = this.room.controller;
    if (!controller) return;
    for (let src of this.room.find(FIND_SOURCES)) {
      this.layoutRoad(src, controller, 3);
    }
  }
}

function layout(room, count = 0) {
  const p = new Paver(room, count);
  p.layoutSrcs();
  p.layoutSpawns();
  p.layoutController();

  p.layoutExtensions();
  p.layoutLinks();
  p.layoutTerminal();
  return p.made;
}



global.layout = layout;
