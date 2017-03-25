const lib = require('lib');

lib.roProp(Room, 'energyFreeAvailable', (room) => room.energyCapacityAvailable - room.energyAvailable);

lib.cachedProp(Room, 'claimable', (room) => room.controller.reservable);

Room.prototype.findStructs = function(...types) {
  if(!this.structsByType) {
    this.structsByType =  _.groupBy(this.find(FIND_STRUCTURES), "structureType");
  }
  return _.flatten(_.map(types, sType => this.structsByType[sType] || []));
};

Room.prototype.roleCreeps = function(role) {
  return this.find(FIND_MY_CREEPS, {memory: {role: role}});
};

Room.prototype.cycleRamparts = function() {
  if (this.assaulters.length) {
    const ramparts = this.findStructs(STRUCTURE_RAMPART);
    for (const r of ramparts) {
      let pub = true;
      for (const h of assaulters) {
        if (pub && h.pos.isNearTo(r)) {
          pub = false;
          this.lastLock = r.id;
        }
      }
      if(r.isPublic !== pub) {
        const ret = r.setPublic(pub);
        console.log(r.note, 'pub', pub, ret);
      }
    }
  }
};

Room.prototype.cycleRampart = function(rampart) {

};

const allies = ['tynstar'];

Room.prototype.run = function() {
  this.allies = _.filter(
    this.find(FIND_HOSTILE_CREEPS), 
    c => c.owner.username in allies);
  this.enemies = _.filter(
    this.find(FIND_HOSTILE_CREEPS), 
    c => !(c.owner.username in allies));
  this.hostiles = _.filter(this.enemies, 'hostile');
  this.assaulters = _.filter(this.enemies, 'assault');

  if (this.controller && this.controller.my) {
    this.runTowers();
    this.runLinks();
    this.runLabs();

    if (this.assaulters.length) {
      const structs = this.findStructs(STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION);
      if( _.find(structs, s => s.hits < s.hitsMax)) {
        console.log('SAFE MODE!', this.controller.activateSafeMode());
      }
    }
  }
};
