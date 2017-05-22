module.exports = class CreepGuard {
  roleGuard() {
    return this.idleRetreat(TOUGH) || this.taskTask() ||
      this.idleMoveRoom(this.team) || this.taskGuard() ||
      this.taskGuardHealRoom() || this.movePeace(this.team);
  }

  afterGuard() {
    if(!this.intents.range) {
      const creep = this.pos.findClosestByRange(this.room.enemies);
      if(creep) {
        if(this.pos.isNearTo(creep)) {
          this.goMassAttack(creep, false);
        } else if(this.pos.inRangeTo(creep, 3)) {
          this.goRangedAttack(creep, false);
        }
      }
    }
    this.idleHeal();
  }

  taskHunt(creep) {
    if(this.room.melees.length) return false;
    creep = this.checkId('hunt', creep);
    if(!creep) return false;
    if(this.pos.isNearTo(creep)) {
      return this.goMassAttack(creep);
    }
    return this.goRangedAttack(creep);
  }

  taskDuel(creep) {
    const nmelees = this.room.melees.length;
    if(nmelees > 1) return false;

    creep = this.checkId('duel', creep);
    if (!creep) return false;

    if(!creep.melee && nmelees) return false;

    return this.goKite(creep);
  }

  taskRiot() {
    let creep = this.pos.findClosestByRange(this.room.melees);
    if (!creep) return false;

    return this.goKite(creep);
  }

  goKite(creep) {
    const range = this.pos.getRangeTo(creep);
    switch (range) {
      case 1:
        this.goMassAttack(creep, false);
        return this.idleFlee(this.room.melees, 5);
      case 2:
        this.goRangedAttack(creep, false);
        return this.idleFlee(this.room.melees, 5);
    }
    return this.goRangedAttack(creep);
  }

  taskGuard() {
    const nenemies = this.room.enemies.length;
    if(!nenemies) return false;

    const nmelees = this.room.melees.length;
    if(!nmelees) {
      return this.taskHunt(_.sample(this.room.enemies));
    }

    if(nmelees === 1) {
      return this.taskDuel(_.first(this.room.melees));
    }

    return this.taskRiot();
  }

  taskGuardHealRoom() {
    const heal = _(this.room.find(FIND_MY_CREEPS))
                     .filter('hurts')
                     .sample();
    return this.taskGuardHeal(heal);

  }

  taskGuardHeal(creep) {
    if(this.room.melees.length) return false;

    creep = this.checkId('guard heal', creep);
    if(!creep || !creep.hurts) return false;
    return this.goHeal(creep);
  }
};
