const lib = require('lib');

const bodies = {
  archer: {
    move: 0.2,
    per: [RANGED_ATTACK],
    max: 1,
  },

  attack: {
    move: 1,
    per: [ATTACK, TOUGH],
  },

  carry: {
    move: 2,
    per: [CARRY],
  },

  carryfar: {
    move: 1,
    per: [CARRY],
  },

  cart: {
    move: 1,
    base: [WORK, MOVE],
    per: [CARRY],
  },

  chemist: {
    move: 2,
    per: [CARRY, CARRY, WORK],
    max: 3,
  },

  claim: {
    move: 0,
    base: [CLAIM],
    per: [MOVE],
    max: 5
  },

  custom: {},

  defender: {
    move: 2,
    per: [ATTACK],
  },

  dismantle: {
    move: 1,
    per: [WORK],
  },

  dismantleslow: {
    move: 2,
    per: [WORK],
  },

  drain: {
    move: 1,
    per: [HEAL, TOUGH],
  },

  drainslow: {
    move: 2,
    //base: [ATTACK, TOUGH, MOVE],
    base: [TOUGH, MOVE],
    per: [HEAL, TOUGH],
  },

  farmer: {
    move: 1,
    per: [WORK, CARRY, CARRY],
  },

  guard: {
    move: 1,
    base: [MOVE, HEAL],
    per: [TOUGH, RANGED_ATTACK],
  },

  miner: {
    move: 1,
    base: [CARRY],
    per: [WORK],
    max: 5,
  },

  ram: {
    move: 1,
    per: [TOUGH, WORK],
  },

  reserve: {
    move: 1,
    base: [MOVE, CLAIM],
    per: [CLAIM],
    max: 2,
  },

  scout: {
    move: 0,
    per: [MOVE],
    max: 1,
  },

  srcer: {
    move: 2,
    base: [CARRY],
    per: [WORK],
    max: 6,
  },

  turtle: {
    move: 2,
    base: [ATTACK, MOVE],
    per: [TOUGH],
  },

  upgrader: {
    move: 2,
    base: [CARRY, CARRY],
    per: [WORK],
  },

  worker: {
    move: 2,
    base: [MOVE, CARRY],
    per: [WORK, CARRY],
  },
};

const partsOrdered = [TOUGH, WORK, CARRY, 'premove', ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL];
const partPriority = (part) => _.indexOf(partsOrdered, part);
const orderParts = (l, r) => partPriority(l) - partPriority(r);

const defCost = (def) => {
  let cost = 0;
  let max = 50;
  if(def.base) {
    max -= def.base.length;
    cost += _.sum(def.base, part => BODYPART_COST[part]);
  }
  cost += def.level * _.sum(def.per, part => BODYPART_COST[part]);
  const nparts = def.level * def.per.length;

  // short circuit 0 move definitions.
  const nmove = def.move && Math.ceil(nparts / def.move);
  if(nparts + nmove > max) {
    return Infinity;
  }
  return cost + BODYPART_COST[MOVE] * nmove;
};

const defBody = (def) => {
  let parts = [];
  for(let i=0; i<def.level; i++) {
    parts = parts.concat(def.per);
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
  levelCreep(priority, mem) {
    if(this.nextPriority >= priority) return false;
    this.nextPriority = priority;

    const parts = defBody(mem);

    mem.spawn = this.name;
    mem.birth = Game.time;
    delete mem.per;
    delete mem.max;
    delete mem.base;
    delete mem.move;

    const who = this.createCreep(parts, undefined, mem);
    console.log(`${this} created ${who}: ${JSON.stringify(mem)}, ${parts}`);
    return who;
  }

  maxCreep(priority, mem) {
    if(this.nextPriority >= priority) return false;

    const def = bodies[mem.body];
    if(!def) return false;

    mem = _.defaults(mem, def);

    mem.level = 2;
    let cost = defCost(mem);
    while(cost < this.room.energyAvailable) {
      mem.level++;
      cost = defCost(mem);
    }
    mem.level = Math.min(mem.max||50, mem.level-1);

    return this.levelCreep(priority, mem);
  }
}

lib.merge(StructureSpawn, Spawn);
