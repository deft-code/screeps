import * as debug from 'debug';
import { repairable, dynMaxHits } from 'creep.repair';

const one = (towers, func, obj) => {
  if (!obj) return towers
  const tower = obj.pos.findClosestByRange(towers)
  const err = func.call(tower, obj)
  if (err !== OK) debug.log(`${tower.pos} Bad tower ${err}: ${tower}, ${obj}`)
  return _.filter(towers, t => t.id !== tower.id)
}

const oneAttack = (towers, creep) => one(towers, StructureTower.prototype.attack, creep)
const oneHeal = (towers, creep) => one(towers, StructureTower.prototype.heal, creep)
const oneRepair = (towers, creep) => one(towers, StructureTower.prototype.repair, creep)

export function runTowers(room) {
  let towers = _.filter(room.findStructs(STRUCTURE_TOWER), t => t.store.energy >= 10)
  if (!towers.length) return

  // Emergency heal of decaying structures
  const decay = _.filter(
    room.find(FIND_STRUCTURES),
    s =>
      (repairable(s) &&
        ((s.structureType === STRUCTURE_RAMPART && s.hits <= RAMPART_DECAY_AMOUNT) ||
          (s.structureType === STRUCTURE_WALL && s.hits <= RAMPART_DECAY_AMOUNT) ||
          (s.structureType === STRUCTURE_ROAD && s.hits <= ROAD_DECAY_AMOUNT) ||
          (s.structureType === STRUCTURE_CONTAINER && s.hits <= CONTAINER_DECAY)
        )
      )
  );
  if (decay.length) {
    for (const tower of towers) {
      tower.repair(_.sample(decay))
    }
    return
  }

  // Heal creeps with lots of damage (maximize tower power)
  towers = oneHeal(towers, _.find(room.find(FIND_MY_CREEPS), c => c.hurts > TOWER_POWER_HEAL))
  if (!towers.length) return
  towers = oneHeal(towers, _.find(room.find(FIND_MY_POWER_CREEPS), c => c.hurts > TOWER_POWER_HEAL))
  if (!towers.length) return

  if (room.assaulters.length === 1) {
    _.forEach(towers, t => t.attack(_.first(room.assaulters)) || true)
    return
  } else if (room.assaulters.length > 1) {
    for (const tower of towers) {
      // const assaulters = _.sortBy(_.shuffle(room.assaulters), c => tower.pos.getRangeTo(c));
      const assaulters = _.sortBy(_.shuffle(room.enemies), c => tower.pos.getRangeTo(c))
      let attack = _.first(assaulters)
      for (const enemy of assaulters) {
        if (_.random(1)) {
          attack = enemy
          break
        }
      }
      tower.attack(attack)
    }
    return
  }

  // Top off damaged creeps
  towers = oneHeal(towers, _.find(room.find(FIND_MY_CREEPS), 'hurts'))
  if (!towers.length) return

  towers = oneHeal(towers, _.find(room.find(FIND_MY_POWER_CREEPS), 'hurts'));
  if (!towers.length) return

  // Upkeep decaying structures to prevent emergency repairs
  towers = oneRepair(towers, _.find(room.findStructs(STRUCTURE_ROAD), r => repairable(r) && r.hits <= 5 * ROAD_DECAY_AMOUNT))
  if (!towers.length) return

  towers = oneRepair(towers, _.find(room.findStructs(STRUCTURE_RAMPART, STRUCTURE_WALL), r => repairable(r) && r.hits <= 5 * RAMPART_DECAY_AMOUNT))
  if (!towers.length) return

  towers = oneRepair(towers, _.find(room.findStructs(STRUCTURE_CONTAINER), r => repairable(r) && r.hits <= 5 * CONTAINER_DECAY))
  if (!towers.length) return


  // take out non assaulter enemy creeps
  towers = oneAttack(towers, _.find(room.enemies, e => e.hits < 150 || e.hurts))
  if (!towers.length) return

  // overheal
  if (room.storage && room.storage.store.energy > 800000 && room.energyAvailable === room.energyCapacityAvailable) {
    towers = _.filter(towers, t => t.store.energy > 800);
    if (!towers.length) return;
    let overRepair = Infinity;
    let repairs = [];
    for (const struct of room.findStructs(STRUCTURE_WALL, STRUCTURE_RAMPART)) {
      const max = dynMaxHits(struct);
      if (struct.hits > max && max > 0) {
        const over = struct.hits / max;
        if (over < overRepair) overRepair = over;
      }
      if (struct.hits < max) {
        repairs.push(struct);
      }
    }
    if (repairs.length === 0) {
      repairs = _.filter(room.find(FIND_STRUCTURES),
        s => s.structureType !== STRUCTURE_ROAD &&
          s.hits < s.hitsMax &&
          s.hits < (overRepair + 0.1) * dynMaxHits(s));
    }
    if (repairs.length === 0) return;
    for (const tower of towers) {
      const target = tower.pos.findClosestByRange(repairs);
      if (!target) return;
      const err = tower.repair(target);
      tower.room.errlog(err, tower, "failed to repair", target);
    }
  }
}

StructureTower.prototype.run = function () {
}
