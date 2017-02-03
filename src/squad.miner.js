const modsquads = require('squads');

class MinerSquad extends modsquads.Squad {
  constructor(name) {
    super(name);
  }

  execute() {
    if (!this.spawn) {
      return 'no spawn';
    }
    const nminers = this.creeps.length;
    if (!(nminers < this.sources.length)) {
      return 'Enough miners';
    }
    const room = this.spawn.room;

    if (nminers == this.sources.length) {
      return 'enough';
    }
    if (this.spawn.spawning) {
      return 'spawning';
    }
    if (nminers > 0 && room.energyAvailable < 600 &&
        room.energyAvailable < room.energyCapacityAvailable) {
      return 'need energy';
    }
    return this.roleMiner();
  }

  roleMiner() {
    let body = [MOVE, WORK, WORK, CARRY, WORK, WORK, WORK, WORK];
    const who =
        this.spawn.createRole(body, 3, {role: 'miner', squad: this.name});
    if (_.isString(who)) {
      this.memory.creeps.push(who);
    }
    return who;
  }

  get sources() {
    return _.map(this.memory.sources, Game.getObjectById);
  }
}
modsquads.Squad.register(MinerSquad);

StructureSpawn.prototype.newMinerSquad = function() {
  const squad = 'Miner' + this.name;
  const srcs = _.sortBy(
      this.room.cachedFind(FIND_SOURCES), s => s.pos.getRangeTo(this.pos));
  const mem = {
    sources: _.map(srcs, 'id'),
    srcers: _.map(srcs, s => null),
  };
  return this.newSquad(squad, MinerSquad, mem);
};

Creep.prototype.roleMiner = function() {
  return this.actionTask() || this.actionSquadMine();
};

Creep.prototype.actionSquadMine = function() {
  for (let i = 0; i < this.squad.sources.length; i++) {
    let srcer = this.squad.memory.srcers[i];
    this.dlog(i, srcer);
    if (srcer == this.name) {
      this.dlog('found self');
      return this.actionMine(this.squad.sources[i]);
    }
    const found = this.squad.memory.creeps.indexOf(srcer);
    if (found == -1) {
      this.squad.memory.srcers[i] = this.name;
      return this.actionMine(this.squad.sources[i]);
    }
  }
  return false;
};

Creep.prototype.actionMine = function(src) {
  if (!src) {
    return false;
  }
  this.memory.task = {
    task: 'mine',
    id: src.id,
    note: modutil.structNote('src', src.pos),
  };
  return this.actionMine();
};

Creep.prototype.taskMine = function() {
  const src = this.taskId;
  if (!src) {
    return false;
  }
  const err = this.harvest(src);
  if (err == ERR_NOT_IN_RANGE || err == ERR_NOT_ENOUGH_RESOURCES) {
    return this.actionMoveTo(src);
  }
  if (this.carry) {
    let bucket = Game.getObjectById(this.memory.task.bucket);
    this.dlog('miner carry', bucket);
    if (!bucket && !this.carryFree) {
      const bucket = _(this.room.cachedFind(FIND_STRUCTURES))
                         .filter(
                             s => s.pos.getRangeTo(this.pos) <= 1 &&
                                 (s.structureType == STRUCTURE_CONTAINER ||
                                  s.structureType == STRUCTURE_STORAGE ||
                                  s.structureType == STRUCTURE_LINK))
                         .sample();
      if (bucket) {
        bucket.memory.bucket = src.id;
        this.memory.task.bucket = bucket.id;
      } else {
        this.drop(RESOURCE_ENERGY);
      }
    }
    if (bucket) {
      const xfer = this.transfer(bucket, RESOURCE_ENERGY);
      if (xfer != OK) {
        delete this.memory.task.bucket;
      } else {
        this.pickup(_.first(this.pos.lookFor(LOOK_ENERGY)), RESOURCE_ENERGY);
      }
    }
  }
  if (err == OK) {
    return src.energy + 1;
  }
  return false;
};
