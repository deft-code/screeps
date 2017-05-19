const lib = require('lib');

const bodies = {
  attack: {
    move: 1,
    level: [ATTACK, TOUGH],
  },

  carry: {
    move: 2,
    level: [CARRY],
  },

  carryfar: {
    move: 1,
    level: [CARRY],
  },

  claim: {
    move: 0,
    base: [CLAIM],
    level: [MOVE],
    max: 5
  },

  defender: {
    move: 2,
    level: [ATTACK],
  },

  dismantle: {
    move: 1,
    level: [WORK],
  },

  dismantleslow: {
    move: 2,
    level: [WORK],
  },

  drainslow: {
    move: 2,
    base: [ATTACK, TOUGH, MOVE],
    level: [HEAL, TOUGH],
  },

  farmer: {
    move: 1,
    level: [WORK, CARRY, CARRY],
  },

  guard: {
    move: 1,
    base: [MOVE, HEAL],
    level: [TOUGH, RANGED_ATTACK],
  },

  ram: {
    move: 1,
    level: [TOUGH, WORK],
  },

  reserve: {
    move: 1,
    base: [MOVE, CLAIM],
    level: [CLAIM],
    max: 2,
  },

  scout: {
    move: 0,
    level: [MOVE],
    max: 1,
  },

  srcer: {
    move: 2,
    base: [CARRY],
    level: [WORK],
    max: 6,
  },

  upgrader: {
    move: 2,
    base: [CARRY, CARRY],
    level: [WORK],

    // TODO limit upgraders is some way.
    max: 5,
  },

  worker: {
    move: 2,
    base: [MOVE, CARRY],
    level: [WORK, CARRY],
  },
};

const partsOrdered = [TOUGH, WORK, CARRY, 'premove', ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL];
const partPriority = (part) => _.indexOf(partsOrdered, part);
const orderParts = (l, r) => partPriority(l) - partPriority(r);

const defCost = (def, level) => {
  let cost = 0;
  let max = 50;
  if(def.base) {
    max -= def.base.length;
    cost += _.sum(def.base, part => BODYPART_COST[part]);
  }
  cost += level * _.sum(def.level, part => BODYPART_COST[part]);
  const nparts = level * def.level.length;

  // short circuit 0 move definitions.
  const nmove = def.move && Math.ceil(nparts / def.move);
  if(nparts + nmove > max) {
    return Infinity;
  }
  return cost + BODYPART_COST[MOVE] * nmove;
};

const defBody = (def, level) => {
  let parts = [];
  for(let i=0; i<level; i++) {
    parts = parts.concat(def.level);
  }
  const move = def.move && Math.ceil(parts.length / def.move);
  for(let i=0; i<move; i++){
    if(i < move/2) {
      parts.push('premove');
    } else {
      parts.push(MOVE);
    }
  }

  if(def.base) {
    parts = parts.concat(def.base);
  }

  parts.sort(orderParts);
  parts = _.map(parts, part => {
    if(part === 'premove') return MOVE;
    return part;
  });
  return parts;
};

class Spawn {
  levelCreep(priority, level, mem) {
    if(this.nextPriority >= priority) return false;
    this.nextPriority = priority;

    const def = bodies[mem.body];
    if(!def) return false;

    const parts = defBody(def, level);

    mem.level = level;
    mem.spawn = this.name;
    mem.birth = Game.time;

    console.log("levelCreep", priority, level, JSON.stringify(mem), parts);

    return this.createCreep(parts, undefined, mem);
  }

  maxCreep(priority, mem) {
    if(this.nextPriority >= priority) return false;

    const def = bodies[mem.body];
    if(!def) return false;

    let level = 2;
    let cost = defCost(def, level);
    while(cost < this.room.energyAvailable) {
      level++;
      cost = defCost(def, level);
    }
    level = Math.min(def.max||50, level-1);

    console.log("maxCreep", priority, level, defCost(def, level), JSON.stringify(mem));

    return this.levelCreep(priority, level, mem);
  }
}

lib.merge(StructureSpawn, Spawn);
