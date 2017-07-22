const kStuckCreep = 0xfe;
const kStuckRange = 2;
const kMaxStall = 7;

const gCache = {}

exports.draw = (roomName) => {
  console.log("draw2", roomName);
  const mat = exports.get(roomName);
  const vis = new RoomVisual(roomName);
  for(let x=0; x<50; x++) {
    for(let y=0; y<50; y++) {
      const v = mat.get(x, y);
      if(v === 0xff) {
        vis.circle(x, y, {fill:'red', opacity:1});
      } else if(v === 1) {
        vis.circle(x, y, {fill:'white', opacity:1});
      } else if( v > 0) {
        vis.circle(x, y, {fill:'blue', opacity:1});
      }
    }
  }
};

exports.get = (roomName) => {
  const entry = gCache[roomName];
  const room = Game.rooms[roomName];
  if(!entry) {
    if(!room) return new PathFinder.CostMatrix();
  } else {
    if(entry.t === Game.time || !room) {
      if(!room) console.log(`Blind Matrix ${roomName}`);
      return entry.mat;
    }
  }

  const mat = new PathFinder.CostMatrix();
  addStructures(mat, room);
  addCreeps(mat, room);

  gCache[room.name] = {
    t: Game.time,
    mat: mat,
  };
  return mat;
};

exports.repath = (me) => (roomName) => {
  const mat = exports.get(roomName);
  if(roomName !== me.pos.roomName) return mat;
  for(const creep of me.room.find(FIND_CREEPS)) {
    if(creep.pos.inRangeTo(creep, kStuckRange)) {
      mat.set(creep.pos.x, creep.pos.y, kStuckCreep);
    }
  }
  return mat;
};

const calcStall = (room) => {
  const mem = room.memory.stalls || {};
  if(mem.t === Game.time) return;
  const newMem = {t: Game.time};
  for(const creep of room.find(FIND_CREEPS)) {
    const prev = mem[creep.id];
    if(!prev || prev.x !== creep.pos.x || prev.y !== creep.pos.y) {
      newMem[creep.id] = {
        x: creep.pos.x,
        y: creep.pos.y,
        t: Game.time,
      };
      continue;
    }
    newMem[creep.id] = prev;
  }
  room.memory.stalls = newMem;
};

exports.getStallTicks = (creep) => {
  const mem = creep.room.memory.stalls;
  if(!mem) return 0;

  const cmem = mem[creep.id];
  if(!cmem) return 0;

  return Game.time - cmem.t;
};

const setArea = (mat, pos, range, cost) => {
  for(let dx=-range; dx<=range; dx++) {
    for(let dx=-range; dx<=range; dx++) {
      const [x, y] = [pos.x+dx, pos.y+dy];
      if(x < 0 || y < 0) continue;
      if(x > 49 || y > 49) continue;
      mat.set(x, y, cost);
    }
  }
};

const addCreeps = (mat, room) => {
  calcStall(room);
  for(const creep of room.find(FIND_CREEPS)) {
    const dt = exports.getStallTicks(creep);
    if(dt >= kMaxStall) {
      mat.set(creep.pos.x, creep.pos.y, Math.min(kStuckCreep, Math.floor(dt/kMaxStall)));
    }
    const info = creep.info;
    if(info.rangedAttack) {
      setArea(mat, creep.pos, 3, 20);
    } else if(info.attack) {
      setArea(mat, creep.pos, 1, 20);
    }
  }
};

const addStructures = (mat, room) => {
  for(const struct of room.find(FIND_STRUCTURES)) {
    const [x, y] = [struct.pos.x, struct.pos.y];
    switch(struct.structureType) {
      case STRUCTURE_RAMPART:
        if(!struct.my) {
          mat.set(x, y, 0xff);
        }
        break;
      case STRUCTURE_ROAD:
        mat.set(x, y, 1);
        break;
      case STRUCTURE_KEEPER_LAIR:
        setArea(mat, struct.pos, 3, 20);
        break;
      default:
        if(struct.structureType !== STRUCTURE_CONTAINER) {
          mat.set(x, y, 0xff);
        }
        break;
    }
  }
};
