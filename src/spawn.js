const debug = require('debug');
const routes = require('routes');

function eggOrder(lname, rname) {
  const lpriority = _.get(Memory.creeps, `[${lname}].egg.priority`, 10);
  const rpriority = _.get(Memory.creeps, `[${rname}].egg.priority`, 10);
  return lpriority - rpriority;
}

exports.run = () => {
  const all = _.keys(Memory.creeps);
  const eggs = _.filter(all,
    (cname) => _.isObject(Memory.creeps[cname].egg));

  eggs.sort(eggOrder);

  for(let egg of eggs) {
    const ret = runEgg(egg);
    if(ret) return ret;
  }
};

function runEgg(egg) {
  const eggMem = Memory.creeps[egg].egg;
  const spawns = findSpawns(eggMem);
  const [spawn, body] = buildBody(spawns, eggMem);
  if(!spawn) return false;
  debug.log(egg, spawn, JSON.stringify(_.countBy(body)));

  const err = spawn.spawnCreep(body, egg);
  if(err != OK) {
    debug.log("Failed to spawn", egg, JSON.stringify(eggMem));
  } else {
    delete Memory.creeps[egg].egg;
  }
}

function findSpawns(eggMem) {
  const allSpawns = _.values(Game.spawns);
  const tname = Game.flags[eggMem.team].pos.roomName;

  let spawns = [];
  switch(eggMem.spawn) {
    case 'local':
      let dist = 11;
      for(const s of allSpawns) {
        const room = s.pos.roomName;
        const d = routes.dist(tname, room);
        if(d < dist) {
          dist = d;
          spawns = [s];
        } else if(d === dist) {
          spawns.push(s);
        }
      }
      break;
    default:
      debug.log("Missing spawn algo", eggMem.spawn);
      break;
  }
  return _.shuffle(_.filter(spawns, s => !s.spawning));
}

function buildCtrl(spawns, eggMem) {
  if(eggMem.ecap > kRCL7Energy) {
    return [
      _.find(spawns, s => s.room.energyAvailable >= 2050), [
        MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY]];
  }

  if(eggMem.ecap > kRCL6Energy) {
    const spawn = _.find(spawns, s => s.room.energyAvailable >= 4200);
    if(!spawn) return [null, []];

    return [spawn, [
      MOVE, MOVE, MOVE, MOVE, MOVE,
      MOVE, MOVE, MOVE, MOVE, MOVE,
      MOVE, MOVE, MOVE, MOVE, MOVE,

      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,

      CARRY, CARRY, CARRY, CARRY, CARRY]];
  }

  const spawn = _.find(spawns, s => s.room.energyAvailable >= eggMem.ecap);
  if(!spawn) return [null, []];

  const def = {
    move: 2,
    per: [WORK],
    base: [CARRY],
    energy: eggMem.ecap,
  };

  if(eggMem.ecap > kRCL4Energy) {
    def.base.push(CARRY);
  }

  const body = energyDef(def);

  return [spawn, body];
}

function buildBody(spawns, eggMem) {
  let spawn;
  let body = [];
  switch(eggMem.body) {
    case 'reboot':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 200);
      body = [WORK, CARRY, MOVE];
      break;
    case 'coresrc':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 700);
      body = [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE];
      break;
    case 'ctrl':
      [spawn, body] = buildCtrl(spawns, eggMem);
      break;
    case 'hauler':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= eggMem.energy);
      if(!spawn) break;
      body = energyDef(_.defaults({}, eggMem, {
        move: 2,
        per: [CARRY],
      }));
      break;
    case 'shunt':
      spawn = _.find(spawns,
        s => s.room.energyAvailable >= 250);
      body = [CARRY, CARRY, CARRY, CARRY, MOVE];
      break;
    case 'worker':
      spawn = _.find(spawns,
        s => s.room.energyFreeAvailable === 0);
      if(!spawn) break;
      body = energyDef({
        move: 2,
        base: [MOVE, CARRY],
        per: [WORK, CARRY],
        energy: spawn.room.energyAvailable,
      });
      break;
    default:
      debug.log("Missing body algo", eggMem.body);
      break;
  }
  return [spawn, body];
}

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
    base:[CARRY, CARRY, MOVE],
    per: [WORK],
  },

  claim: {
    move: 0,
    base: [CLAIM],
    per: [MOVE],
    max: 5
  },

  counter: {
    move: 1,
    per: [ATTACK],
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
    base: [ATTACK, MOVE],
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

  harvester: {
    move: 1,
    base: [CARRY],
    per: [WORK],
    max: 6,
  },

  heal: {
    move: 1,
    base: [ATTACK, MOVE],
    per: [HEAL],
  },

  hunter: {
    move: 1,
    base: [HEAL, MOVE],
    per: [ATTACK],
  },

  miner: {
    move: 1,
    base: [CARRY],
    per: [WORK],
    max: 5,
  },

  mineral: {
    move: 2,
    base:[CARRY, CARRY, MOVE],
    per: [WORK],
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

const sortFromOrder = (items, order) => l.sort((l, r) => _.indexOf(order, l) - _.indexOf(order, r))

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

function energyDef(def) {
  debug.log(JSON.stringify(def));
  def.level = 2;
  let cost = defCost(def);
  const max = def.max || 50;
  while(cost < def.energy && def.level <= max) {
    def.level++;
    cost = defCost(def);
  }
  def.level--;
  return defBody(def);
}
