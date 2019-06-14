import * as debug from 'debug';

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

Room.prototype.runTowers = function () {
  let towers = _.filter(this.findStructs(STRUCTURE_TOWER), t => t.energy >= 10)
  if (!towers.length) return

  const decay = _.filter(
    this.find(FIND_STRUCTURES),
    s => (
      (s.structureType === STRUCTURE_RAMPART && s.hits <= 10 * RAMPART_DECAY_AMOUNT) ||
      (s.structureType === STRUCTURE_WALL && s.hits <= 10 * RAMPART_DECAY_AMOUNT) ||
      (s.structureType === STRUCTURE_ROAD && s.hits <= 5 * ROAD_DECAY_AMOUNT) ||
      (s.structureType === STRUCTURE_CONTAINER && s.hits <= CONTAINER_DECAY)))
  if (decay.length) {
    for (const tower of towers) {
      tower.repair(_.sample(decay))
    }
    return
  }

  towers = oneHeal(towers, _.find(this.find(FIND_MY_CREEPS), c => c.hurts > TOWER_POWER_HEAL))
  if (!towers.length) return

  if (this.assaulters.length === 1) {
    _.forEach(towers, t => t.attack(_.first(this.assaulters)) || true)
    return
  } else if (this.assaulters.length > 1) {
    for (const tower of towers) {
      // const assaulters = _.sortBy(_.shuffle(this.assaulters), c => tower.pos.getRangeTo(c));
      const assaulters = _.sortBy(_.shuffle(this.enemies), c => tower.pos.getRangeTo(c))
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

  towers = oneHeal(towers, _.find(this.find(FIND_MY_CREEPS), 'hurts'))
  if (!towers.length) return

  towers = oneRepair(towers, _.find(this.findStructs(STRUCTURE_ROAD), r => r.hurts > TOWER_POWER_REPAIR))
  if (!towers.length) return

  towers = oneAttack(towers, _.find(this.enemies, e => e.hits < 150 || e.hurts))
  if (!towers.length) return

  _.forEach(towers, t => t.run())
}

StructureTower.prototype.run = function () {
  const surpluss = this.room.storage && this.room.storage.store.energy > 800000

  if (surpluss && this.energy > 800 &&
      this.room.energyAvailable === this.room.energyCapacityAvailable) {
    let needRepair = _.sample(
        this.room.find(FIND_STRUCTURES, {
          filter: s =>
              s.hitsMax - s.hits > 800 && s.structureType !== STRUCTURE_ROAD
        }),
        3)
    if (needRepair.length) {
      const s = _(needRepair).sortBy('repairs').last()
      this.repair(s)
      return s.note
    }
  }
}
