const lib = require('lib');

const bodies = {
  carry: {
    move: 2,
    level: [CARRY],
  },

  carryFar: {
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

  farmer: {
    move: 1,
    level: [WORK, CARRY, CARRY],
  },

  guard: {
    move: 1,
    base: [MOVE, HEAL],
    level: [TOUGH, RANGED_ATTACK],
  },

  reserve: {
    move: 1,
    base: [MOVE, CLAIM],
    level: [CLAIM],
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
  },

  worker: {
    move: 2,
    base: [MOVE, CARRY],
    level: [WORK, CARRY],
  },
};

const partsOrdered = [TOUGH, CARRY, 'premove', WORK, ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL];
const partPriority = (part) => _.indexOf(partsOrdered, part);
const orderParts = (l, r) => partPriority(l) - partPriority(r);

const defCost = (def, level) => {
  let parts = 0;
  let cost = 0;
  let max = 50;
  if(def.base) {
    max -= def.base.length;
    cost += _.sum(def.base, part => BODYPART_COST[part]);
  }
  cost += level * _.sum(def.level, part => BODYPART_COST[part]);
  const nparts = level * def.level.length;

  const nmove = Math.ceil(parts / def.move);
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
  const move = Math.ceil(parts.length / def.move);
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

    const def = bodies[mem.body];
    if(!def) return false;

    const parts = defBody(def, level);

    mem.level = level;
    mem.spawn = this.name;
    mem.birth = Game.time;

    console.log("levelCreep", parts, JSON.stringify(mem));

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
    level--;

    console.log("maxCreep", priority, level, JSON.stringify(mem));

    return this.levelCreep(priority, level, mem);
  }
}

lib.merge(StructureSpawn, Spawn);
