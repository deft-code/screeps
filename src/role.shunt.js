const debug = require('debug');

module.exports = class CreepShunt {
  roleAux() { return this.roleCore(); }
  afterAux() { return this.afterCore(); }

  roleCore() {
    if(this.moveSpot()) return 'moved';

    const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);
    const structs = _.shuffle(_.map(spots, s => s[LOOK_STRUCTURES]));

    if(!this.carry.energy) {
      const e = _.find(structs, s => s.store && s.store.energy > 0);
      return this.goWithdraw(e, RESOURCE_ENERGY, false);
    }

    for(const struct of structs) {
      switch(struct.structureType) {
        case STRUCTURE_SPAWN:
        case STRUCTURE_TOWER:
          if(struct.energyFree) return this.goTransfer(struct, RESOURCE_ENERGY, false);
      }
    }

    return 'done';
  }

  afterCore() {
    this.idleNom();
    this.structAtSpot(STRUCTURE_RAMPART);
  }

  moveSpot() {
    const p = this.teamRoom.getSpot(this.role);
    if(!this.pos.isEqualTo(p)) {
      return this.movePos(p);
    }
    return false;
  }

  structAtSpot(stype) {
    const p = this.teamRoom.getSpot(this.role);
    const struct = _.find(p.lookFor(LOOK_STRUCTURES), 
      s => s.structureType === stype);
    if(struct) return;
    return this.teamRoom.keeper().planOne(stype, p.x, p.y);
  }

  localStructs(...stypes) {
    structs = this.memory.structs = this.memory.structs || {};
    for(const stype of stypes) {
      const nn = `n${stype}`;
      const prev = structs[nn];
      const ss = this.room.findStructs(stype);
      const n = ss.length;
      if(prev === n) continue;

      structs[nn] = n;
      for(const s of ss) {

      }
    }
  }
}
