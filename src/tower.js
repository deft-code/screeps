var doTower = function(tower) {
  if(!tower.energy) return false;

  const struct =
      _(tower.room.find(FIND_STRUCTURES))
          .filter(
              s => /* TODO re-enable after dismantle is fixed !s.dismantle && */
                  ((s.structureType == STRUCTURE_RAMPART &&
                    s.hits <= RAMPART_DECAY_AMOUNT) ||
                   (s.structureType == STRUCTURE_ROAD && s.hits <= 900) ||
                   (s.structureType == STRUCTURE_CONTAINER &&
                    s.hits <= CONTAINER_DECAY) ||
                   (s.structureType == STRUCTURE_WALL && s.hits < 1000)))
          .sample();
  if (struct) {
    console.log('Tower repair', struct.note);
    tower.repair(struct);
    return true;
  }

  const heal = _(tower.room.find(FIND_MY_CREEPS))
                   .filter(c => c.hitsMax - c.hits > 100)
                   .sortBy('hits')
                   .first();
  if (heal) {
    let err = tower.heal(heal);
    console.log(tower.room.name, 'Tower heal', heal.name, err);
    return true;
  }

  let enemies = _.filter(
      tower.room.find(FIND_HOSTILE_CREEPS),
      c => c.pos.x != 0 && c.pos.y != 0 && c.pos.x != 49 && c.pos.y != 49);
  let aggressive = _.filter(enemies, c => {
    const counts = _.countBy(c.body, 'type');
    const nwork = counts[WORK] || 0;
    const nattack = counts[ATTACK] || 0;
    const nranged = counts[RANGED_ATTACK] || 0;
    return nwork + nattack + nranged > 0;
  });
  if (aggressive.length) {
    // let enemy = tower.pos.findClosestByRange(enemies);
    let enemy = _(aggressive).sortBy('hits').last();
    if (enemy) {
      tower.attack(enemy);
      return true;
    }
  }

  creeps = tower.room.find(FIND_MY_CREEPS, {filter: c => c.hits < c.hitsMax});
  if (creeps.length) {
    let hurt = _.sortBy(creeps, 'hits');
    let err = tower.heal(hurt[0]);
    console.log(tower.room.name, 'Tower full heal', hurt[0].name, err);
    return true;
  }

  const surpluss =
      tower.room.storage && tower.room.storage.store.energy > 500000;
  const dropped = _(tower.room.find(FIND_DROPPED_ENERGY))
                      .filter(s => s.amount > 1000)
                      .value()
                      .length;


  if ((surpluss || dropped) && tower.energy > 800 && tower.room.energyAvailable === tower.room.energyCapacityAvailable ) {
    let need_repair = _.sample(
        tower.room.find(FIND_STRUCTURES, {
          filter: s => s.hitsMax - s.hits > 800 &&
              s.structureType != STRUCTURE_ROAD
        }),
        3);
    if (need_repair.length) {
      const s = _(need_repair).sortBy('repairs').last();
      tower.repair(s);
      return s.note;
    }
  }

  return false;
};

module.exports = {
  tower: doTower,
};
