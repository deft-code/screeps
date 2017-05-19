module.exports = class CreepMedic {
  roleMedic() {
    return this.idleRetreat(TOUGH) || this.idleMoveRoom(this.team) ||
      this.taskTask() || this.taskHealTeam(this.team) ||
      this.taskHealRoom();
  }

  taskHealTeam() {
    return this.taskHealCreeps(this.team.creeps);
  }

  taskHealRoom() {
    return this.taskHealCreeps(this.room.find(FIND_MY_CREEPS));
  }

  taskHealCreeps(creeps) {
    return this.taskHeal(_.find(creeps, 'hurts'));
  }

  taskHeal(creep) {
    creep = this.checkId('heal', creep);
    if(!creep || !creep.hurts) return false;
    return this.goHeal(creep);
  }
};
