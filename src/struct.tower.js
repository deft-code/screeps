Room.prototype.runTowers = function() {
  for (let tower of this.findStructs(STRUCTURE_TOWER)) {
    tower.run();
  }
};

StructureTower.prototype.run = function() {
  if (!this.energy) return false;

  const struct =
      _(this.room.find(FIND_STRUCTURES))
          .filter(
              s =>
                  ((s.structureType == STRUCTURE_RAMPART &&
                    s.hits <= RAMPART_DECAY_AMOUNT) ||
                   (s.structureType == STRUCTURE_ROAD && s.hits <= 900) ||
                   (s.structureType == STRUCTURE_CONTAINER &&
                    s.hits <= CONTAINER_DECAY) ||
                   (s.structureType == STRUCTURE_WALL && s.hits < 1000)))
          .sample();
  if (struct) {
    console.log(`Tower${this.pos} repair`, struct.note, this.repair(struct));
    return true;
  }

  const heal = _(this.room.find(FIND_MY_CREEPS))
                   .filter(c => c.hitsMax - c.hits > 100)
                   .sortBy('hits')
                   .first();
  if (heal) {
    console.log(`Tower${this.pos} heal`, heal.name, this.heal(heal));
    return true;
  }

  let enemies = _.filter(
      this.room.assaulters,
      c => c.pos.x != 0 && c.pos.y != 0 && c.pos.x != 49 && c.pos.y != 49);

  if (this.room.assaulters.length) {
    // let enemy = this.pos.findClosestByRange(enemies);
    let enemy = _(this.room.assaulters).sortBy('hits').last();
    if (enemy) {
      this.attack(enemy);
      return enemy.hits;
    }
  }

  creeps = this.room.find(FIND_MY_CREEPS, {filter: c => c.hits < c.hitsMax});
  if (creeps.length) {
    const hurt = _.sortBy(creeps, 'hits')[0];
    console.log(`Tower${this.pos} full heal`, hurt.name, this.heal(hurt));
    return hurt.name;
  }

  const surpluss = this.room.storage && this.room.storage.store.energy > 800000;
  const dropped = _(this.room.find(FIND_DROPPED_RESOURCES))
                      .filter(s => s.amount > 1000)
                      .value()
                      .length;

  if ((surpluss || dropped) && this.energy > 800 &&
      this.room.energyAvailable === this.room.energyCapacityAvailable) {
    let need_repair = _.sample(
        this.room.find(FIND_STRUCTURES, {
          filter: s =>
              s.hitsMax - s.hits > 800 && s.structureType != STRUCTURE_ROAD
        }),
        3);
    if (need_repair.length) {
      const s = _(need_repair).sortBy('repairs').last();
      this.repair(s);
      return s.note;
    }
  }

  return false;
};
