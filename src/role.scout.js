module.exports = class CreepScout {
  roleScout() {
    if(this.atTeam) {
      const creep = this.pos.findClosestByRange(this.room.hostiles);
      if(creep && this.pos.inRangeTo(creep, 4)) {
        this.dlog("Scout flee");
        return this.idleFlee(this.room.hostiles, 6);
      }
    }
    this.dlog("Scout move");
    return this.idleMoveRoom(this.team) || 
      this.moveRange(this.team);
  }
};
