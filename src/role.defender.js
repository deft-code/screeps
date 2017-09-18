module.exports = class CreepDefender {
  roleDefender() {
    return this.taskTask() ||
      this.moveRoom(this.team) ||
      this.idleDefender() ||
      this.moveNear(this.team);
  }

  idleDefender() {
    if(!this.room.assaulters.length) {
      return this.goAttack(this.pos.findClosestByRange(this.room.enemies));
    }

    const ramps = _.sortBy(
      _.filter(this.room.findStructs(STRUCTURE_RAMPART),
        r => r.pos.isNearTo(r.pos.findClosestByRange(this.room.assaulters))),
      r => this.pos.getRangeTo(r));
    for(const ramp of ramps) {
      const creep = _.first(ramp.pos.lookFor(LOOK_CREEPS));
      if(!creep || creep.name === this.name) {
        return this.movePos(ramp.pos) || 'park';
      }
    }

    return this.goAttack(this.pos.findClosestByRange(this.room.assaulters));
  }

  afterDefender() {
    this.idleAttack();
  }
};
