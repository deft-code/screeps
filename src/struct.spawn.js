const util = require('util');
const lib = require('lib');

const partsOrdered = [TOUGH, CARRY, 'premove', WORK, ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL];
const partPriority = (part) => _.indexOf(partsOrdered, part);
const orderParts = (l, r) => partPriority(l) - partPriority(r);

const defCost => (def, level) {
  let parts = 0;
  let cost = 0;
  if(def.prefix) {
    parts += def.prefix.length;
    cost += _.sum(def.prefix, part => BODYPART_COST[part]);
  }
  cost += level * _.sum(def.level, part => BODYPART_COST[part]);
  parts += level * def.level.length;

  const move = Math.ceil(parts / def.move);
  parts += move;
  if(parts > 50) {
    return Infinity;
  }
  return cost + BODYPART_COST[MOVE] * move;
};

 const defBody => (def, level) {
  let parts = (def.prefix || []).slice();
  for(const i=0; i<level; i++) {
    def.level.forEach(part => parts.push(part));
  }
  const move = Math.ceil(parts.length / def.move);
  for(const i=0; i<move; i++){
    if(i < move/2) {
      part.push('premove');
    } else {
      part.push(MOVE);
    }
  }

  parts.sort(orderParts);
  parts = _.map(parts, part => {
    if(part === 'premove') return MOVE;
    return part;
  });
  return parts;
};

class Spawn {
  run() {
    if (this.spawning) {
      const mem = Memory.creeps[this.spawning.name];
      this.dlog(
          'Spawning', JSON.stringify(this.spawning), mem.role, mem.team);
    } else {
      if (this.nextDef) {
        this.dlog('Start Spawning', this.createDef(this.nextDef));
      }
    }
  }

  enqueueDef(def) {
    if (this.spawning) return false;

    maybeDef = _.defaults(def, {
      priority: 0,
    });

    if (!this.nextDef || !this.nextDef.priority > maybeDef.priority) {
      this.nextDef = maybeDef;
      return true;
    }
    return false;
  }

  createDef(def) {
    const memory = def.mem;
    memory.spawn = this.name;
    memory.birth = Game.time;

    let level = def.min || 1;
    const max = def.max || 50;

    for(;level <= max; level++) {
      const cost = this.defCost(def, level);
      if(cost > this.room.energyAvailable) break;
    }

    const body = this.defBody(def, level);
    const who = this.createCreep(body, undefined, memory);
    if(who) {
      Game.flags[memory.team].memory.creeps.push(who);
    }
    return who;
  }
}

lib.merge(StructureSpawn, Spawn);
