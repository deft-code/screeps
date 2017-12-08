module.exports = class CreepShunt {
  roleAux() { return this.roleCore(); }
  afterAux() { return this.afterCore(); }

  roleCore() {
    const p = this.teamRoom.getSpot(this.role);
    if(!this.pos.isEqualTo(p)) {
      this.dlog('moving closer');
      return this.movePos(p);
    }
  }

  afterCore() {
    this.shieldsUp();
  }

  shieldsUp() {
    const p = this.teamRoom.getSpot(this.role);
    const rampart = _.find(p.lookFor(LOOK_STRUCTURES), 
      s => s.structureType === STRUCTURE_RAMPART);
    if(rampart) return;
    return this.teamRoom.keeper().planOne(STRUCTURE_RAMPART, p.x, p.y);
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
