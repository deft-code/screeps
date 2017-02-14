const lib = require('lib');

function layout(room, dry=true) {
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  if(sites.length > 20) return `too full ${sites.length}`;

  return layoutSrc(room, dry) +
    layoutLink(room, dry) +
    layoutSpawn(room, dry) +
    layoutExtensions(room, dry);
}

const canRoad = (room, p) => {
  for(let entry of room.lookAt(p)) {
    switch(entry.type) {
      case 'creep':
        break;
      case 'terrain':
        if(entry.terrain === 'wall') {
          return false;
        }
        break;
      case 'structure':
        if(entry.structure.obstacle) return false;
        if(entry.structure.structureType === STRUCTURE_ROAD) return false;
        break;
      default:
        return false;
    }
  }
  return true;
};

const unRoad = (room, pos, dry) => {
  for(let road of pos.lookFor(LOOK_STRUCTURES)) {
    if(road.structureType === STRUCTURE_ROAD) {
      if(dry) {
        room.visual.circle(road.pos, {radius: 0.5, fill: "red"});
      } else {
        road.destroy();
      }
      return 1;
    }
  }
  return 0;
};

const layoutStruct = (struct, dirs, dry) => {
  const room = struct.room;
  let made = 0;
  for(let dir of dirs) {
    const p = struct.pos.atDirection(dir);
    if(canRoad(room, p)){
      if(dry) {
        room.visual.circle(p);
      } else {
        room.createConstructionSite(p, STRUCTURE_ROAD);
      }
      made++;
    }
  }
  made += unRoad(room, struct.pos, dry);
  return made;
};

function layoutRoad(from, dest, range=1, dry=true) {
  let made = 0;
  const room = from.room;
  const callback = (roomName) => {
    if(roomName !== room.name) {
      console.log("Unexpected room", roomName);
      return false;
    }
    const mat = new PathFinder.CostMatrix();
    for(let site of room.find(FIND_CONSTRUCTION_SITES)) {
      const p = site.pos;
      if(site.structureType === STRUCTURE_ROAD) {
        mat.set(p.x, p.y, 2);
      } else if( lib.structObstacle(site)) {
        mat.set(p.x, p.y, 255);
      }
    }
    for(let struct of room.find(FIND_STRUCTURES)) {
      const p = struct.pos;
      if(struct.structureType === STRUCTURE_ROAD) {
        mat.set(p.x, p.y, 2);
      } else if(struct.obstacle) {
        mat.set(p.x, p.y, 255);
      }
    }
    return mat;
  };
  const ret = PathFinder.search(
    from.pos,
    {pos: dest.pos, range: range},
    {
      plainCost: 3,
      swampCost: 3,
      maxRooms: 1,
      roomCallback: callback,
    });
  if(dry) {
    room.visual.poly(ret.path);
  }
  for(let p of ret.path) {
    if(canRoad(room, p)) {
      made++;
      if(dry) {
        room.visual.circle(p);
      } else {
        room.createConstructionSite(p, STRUCTURE_ROAD);
      }
    }
  }
  return made;
}

function layoutExtensions(room, dry) {
  let made = 0;
  for(let extn of room.findStructs(STRUCTURE_EXTENSION)){
    made += unRoad(room, extn.pos, dry);
  }
  return made;
}

function layoutSpawn(room, dry) {
  let made = 0;
  for(let spawn of room.findStructs(STRUCTURE_SPAWN)){
    made += layoutStruct(spawn,
      [TOP, TOP_LEFT, LEFT, BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT, RIGHT, TOP_RIGHT],
      dry);
    if(room.controller) {
      made += layoutRoad(spawn, room.controller, 3, dry);
    }
    if(room.terminal) {
      made += layoutRoad(spawn, room.terminal, 1, dry);
    }
    for(let src of room.find(FIND_SOURCES)) {
      made += layoutRoad(spawn, src, 1, dry);
    }
    for(let rampart of room.findStructs(STRUCTURE_RAMPART)) {
      made += layoutRoad(spawn, rampart, 3, dry);
    }
    for(let site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
      console.log("checking road", spawn, site);
      if(site.structureType === STRUCTURE_RAMPART) {
        console.log("making road", spawn, site);
        made += layoutRoad(spawn, site, 3, dry);
      }
    }
  }
  return made;
}

function layoutLink(room, dry) {
  let made = 0;
  for(let link of room.findStructs(STRUCTURE_LINK)){
    //made += layoutStruct(link, [TOP, LEFT, BOTTOM, RIGHT], dry);
    made += layoutStruct(link, [], dry);
  }
  return made;
}

function layoutSrc(room, dry) {
  let made = 0;
  for(let src of room.find(FIND_SOURCES)) {
    for(let spot of src.spots) {
      if(canRoad(room, spot)){
        if(dry) {
          room.visual.circle(spot);
        } else {
          room.createConstructionSite(spot, STRUCTURE_ROAD);
        }
        made++;
      }
    }
  }
  return made;
}

global.layout = layout;
global.layoutRoad = layoutRoad;
