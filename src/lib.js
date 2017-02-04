// A standard collection of helper functions for screeps.
//
// The library has no external side effects; it does not modify any prototypes.
// However, most helpers are structured so they can be easily
// added to the exsiting Object prototypes; see cachedProp.

// A quick helper to defined cached properties on a screeps object.
//
// Example:
// const lib = require('lib');
// lib.cachedProp(Creep, 'bodyCost', lib.bodyCost);
exports.cachedProp = (klass, prop, func) => {
  Object.defineProperty(klass.prototype, prop, {
    get: function() {
      // A work around for screeps-profiler prototype mangling.
      if (this === klass.prototype || this == undefined) return;

      let result = func.call(this, this);
      Object.defineProperty(
          this, prop, {value: result, configurable: true, enumerable: false});
      return result;
    },
    configurable: true,
    enumerable: false
  });
};

exports.roProp = (klass, prop, func) => {
  Object.defineProperty(klass.prototype, prop, {
    get: function() {
      // A work around for screeps-profiler prototype mangling.
      if (this === klass.prototype || this == undefined) return;

      return func.call(this, this);
    },
    configurable: true,
    enumerable: false
  });
};

exports.patch = (fn) => function(...args){
    return fn(this, ...args);
  };

exports.enhance = (klass, prop, fn) => {
  if(fn.length == 1) {
    exports.cachedProp(klass, prop, fn);
  } else if( fn.length > 1) {
    klass.prototype[prop] = exports.patch(fn);
  }
};

exports.cache = (opts, fn) => {
  return function(...args) {
    const cache = opts.getcache(this);
    const key = opts.resolver(args);
    const entry = cache[key];
    if (!entry || entry.ttl < Game.time) {
      const ttl = opts.ttl || 0;
      entry = cache[key] = {
        ttl: Math.floor(Game.time + ttl * Math.random() + ttl / 2),
        value: fn.apply(this, args),
      };
    }
    return entry.value;
  };
};

exports.thisCache = (prop_opts, fn) => {
  const prop = opts.prop || opts;
  opts = {
    resolver: opts.resovler || JSON.stringify,
    getcache: (obj) => {
      const c1 = obj.libcache = obj.libcache || {};
      return c1[prop] = c1[prop] || {};
    },
  };
  return exports.cache(opts, fn);
};
exports.globalCache = exports.thisCache;

exports.memoryCache = (prop_opts, fn) => {
  const prop = opts.prop || opts;
  opts = {
    ttl: opts.ttl || 100,
    resolver: opts.resovler || JSON.stringify,
    getcache: (obj) => {
      const c1 = obj.memory.libcache = obj.memory.libcache || {};
      return c1[prop] = c1[prop] || {};
    },
  };
  return exports.cache(opts, fn);
};


// Returns a RoomPosition for obj or null if no position can be found.
exports.getPos = (obj) => {
  if (obj instanceof RoomPosition) {
    return obj;
  }
  if (obj.pos instanceof RoomPosition) {
    return obj.pos;
  }
  for (let prop of obj) {
    if (prop instanceof RoomPosition) {
      return prop;
    }
  }
  return null;
};

// Total energy cost to spawn a creep with parts.
exports.partsCost = (parts) => _.sum(parts, part => BODYPART_COST[part]);

// Total time to creep took to spawn.
exports.creepSpawnTime = (creep) => CREEP_SPAWN_TIME * creep.body.length;

// Total amount of carried resources.
exports.creepCarryTotal = (creep) => _.sum(creep.carry);

// Available carrying capacity.
exports.creepCarryFree = (creep) =>
    creep.carryCapacity - exports.creepCarryTotal(creep);

// Amount of hits `creep` is missing.
exports.creepHitsGone = (creep) => creep.hitsMax - creep.hits;

// Fatigue generated when `creep` moves.
exports.creepWeight = (creep) => {
  let weight = 0;
  let carry = exports.creepCarryTotal(creep);
  for (let i = creep.body.length - 1; i >= 0; i--) {
    const part = creep.body[i];
    switch (part.type) {
      case MOVE:
        break;
      case CARRY:
        if (carry > 0) {
          weight++;
          carry -= getPartInfo(part).capacity;
        }
        break;
      default:
        weight++;
        break;
    }
  }
  return weight;
};

// Returns resource amounts from `creep` creation.
// If `current` then returns reclaimable resources.
exports.creepBodyCost = (creep, current) => {
  const cost = {
    energy: 0,
  };
  let claim = false;
  for (let part of creep.body) {
    claim = claim || part.type == CLAIM;
    cost.energy += BODYPART_COST[part.type];
    if (part.boosted) {
      cost[part.boosted] = 30 + cost[part.boosted] || 0;
    }
  }
  if (current) {
    const lifetime = claim ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
    const scale = creep.ticksToLive / lifetime;
    for (let res in cost) {
      cost[res] = Math.floor(cost[res] * scale);
    }
  }
  return cost;
};

const power = {};
power[ATTACK] = {
  attack: ATTACK_POWER,
};
power[CARRY] = {
  capacity: CARRY_CAPACITY,
};
power[CLAIM] = {
  attackController: CONTROLLER_CLAIM_DOWNGRADE,
  upgradeController: UPGRADE_CONTROLLER_POWER,
};
power[HEAL] = {
  heal: HEAL_POWER,
  rangedHeal: RANGED_HEAL_POWER,
};
power[MOVE] = {
  fatigue: 2,  // Huh! No constant for this?!
};
power[RANGED_ATTACK] = {
  rangedAttack: RANGED_ATTACK_POWER,
  rangedMassAttack: RANGED_ATTACK_POWER,
};
power[TOUGH] = {
  hits: 0,
};
power[WORK] = {
  build: BUILD_POWER,
  dismantle: DISMANTLE_POWER,
  harvest: HARVEST_POWER,
  mineral: HARVEST_MINERAL_POWER,
  repair: REPAIR_POWER,
};

function getPartInfo(part) {
  const partInfo = _.clone(power[part.type]);
  if (part.boosted) {
    const boost = BOOSTS[part.type][part.boosted];
    for (let action in boost) {
      if (action == 'damage') {
        partInfo.hits += Math.floor(part.hits * (1 - boost[action]));
        continue;
      }
      if (action == 'harvest') {
        partInfo.mineral *= boost[action];
      }
      partPower[action] *= boost[action];
    }
  }
  return partInfo;
}

// Info about the power of `creep`s actions.
// Most keys are standard action names
// The exceptions:
// * hits: a pseudo count of the extra hits available to boosted TOUGH parts.
// * mineral: harvest power when harvesting a mineral.
// * fatigue: is the fatigue removed by MOVE parts.
// * capacity: is equivalent to `carryCapacity` unless `creep` is damaged.
exports.creepBodyInfo = (creep, all) => {
  let info = {};
  for (let part of power) {
    for (let action in part) {
      info[action] = 0;
    }
  }

  for (let i = 0; i < creep.body.length; i++) {
    const part = creep.body[i];
    if (!all && !part.hits) continue;
    const p = partPower(creep.body[i]);
    for (let action in p) {
      info[action] += p[action];
    }
  }
  return info;
};


exports.roomposFromMem = (obj) => new RoomPosition(obj.x, obj.y, obj.roomName);

// Total amount of stored resources.
exports.structCarryTotal = (struct) => _.sum(struct.store);

// Available carrying capacity.
exports.structCarryFree = (struct) =>
    struct.carryCapacity - exports.structCarryTotal(struct);

// Available energy capacity.
exports.structEnergyFree = (struct) => struct.energyCapacity - struct.energy;

lerp = (ratio, from, to) => from + (to - from) * ratio;

towerPower = (power, from, to) => {
  const fpos = exports.getPos(from);
  const tpos = exports.getPos(to);
  if (!fpos || !tpos) {
    return ERR_INVALID_ARGS;
  }
  if (!range) {
    return ERR_NOT_IN_RANGE;
  }

  if (range <= TOWER_OPTIMAL_RANGE) {
    return power;
  }

  const min = power - power * TOWER_FALLOFF;
  if (range >= TOWER_FALLOFF_RANGE) {
    return min;
  }

  const lerp_total = TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE;
  const lerp_range = range - TOWER_OPTIMAL_RANGE;
  const ratio = lerp_range / lerp_total;

  return Math.floor(lerp(ratio, power, min));
};

exports.towerAttackPower = (tower, target) =>
    towerPower(TOWER_POWER_ATTACK, tower, target);
exports.towerHealPower = (tower, target) =>
    towerPower(TOWER_POWER_HEAL, tower, target);
exports.towerRepairPower = (tower, target) =>
    towerPower(TOWER_POWER_REPAIR, tower, target);

exports.defaultCostMatrix = (roomName, opts) => {
  const cost = {
    plain: opts.plainCost || 1,
    swamp: opts.swampCost || 5,
    wall: 255,
  };
  const mat = PathFinder.CostMatrix();
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const terrain = Game.map.getTerrainAt(x, y, roomName);
      mat.set(x, y, cost[terrain]);
    }
  }
  return mat;
};

exports.customCostMatrix = (room, costCb) => {
  const mat = PathFinder.CostMatrix();
  const objs = room.lookAtArea(0, 0, 49, 49);
  let i = 0;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const at = [];
      let terrain;
      for (let obj of objs[x][y]) {
        if (obj.type === 'terrain') {
          terrain = obj.terrain;
        } else {
          at.push(obj);
        }
      }
      const cost = costCb(x, y, terrain, at);
      mat.set(x, y, cost);
    }
  }
  return mat;
};

exports.enhanceProto = (klass, re) => {
  for (let fname in exports) {
    const found = re.exec(fname);
    if (found) {
      const prop = _.camelCase(found[1]);
      const fn = exports[fname];
      exports.enhance(klass, prop, fn);
    }
  }
};

exports.enhanceCreep = () => exports.enhanceProto(Creep, /^creep(.*)$/, exports);
exports.enhanceTower = () => exports.enhanceProto(StructureTower, /^tower(.*)/, exports);

exports.enhanceAll = () => {
  exports.enhanceCreep();
  exports.enhanceTower();
};
