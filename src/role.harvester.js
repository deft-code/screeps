module.exports = class CreepHarvester {
  roleHarvester() {
    let what = this.taskTask();
    if(what) return what;

    const src = Game.getObjectById(this.memory.job.src);
    // it's possible to not have visibility into the team room.
    if(!src) return this.moveRoom(this.team);

    if(!this.pos.isEqualTo(src.bestSpot)) return this.movePos({pos: src.bestSpot});

    if(!this.memory.active) {
      this.memory.active = Game.time;
    }

    const cont = this.makeCont();
    if(!cont) {
      const err = this.room.createConstructionSite(this.pos, STRUCTURE_CONTAINER);
      this.dlog("create site", err);
      return 'create';
    }

    if(cont instanceof ConstructionSite) {
      return this.taskBuild(cont) || this.taskHarvest(src);
    }

    if(this.carry.energy && cont.hurts > cont.hits) {
      return this.taskRepair(cont);
    }

    if(src.energy && cont.storeFree > this.info.harvest) {
      return this.goHarvest(src, false);
    }
    return this.taskRepair(cont) || this.goWithdraw(cont, RESOURCE_ENERGY, false) || 'waiting';
  }

  spawnChild() {
    if(!this.memory.child) {
      const active = this.memory.active || this.memory.birth+25;
      const travel = Math.min(200, active - this.memory.birth);
      if(this.ticksToLive < travel + this.spawnTime) {
        const who = this.team.makeRole({
          role: this.memory.role,
          body: this.memory.body,
          job: this.memory.job,
        }, 3, this.team.closeSpawn() );
        if(_.isString(who)) {
          this.memory.child = who;
        }
      }
    }
  }

  makeCont() {
    let cont = Game.getObjectById(this.memory.cont);
    if(cont) return cont;

    for(const spot of this.pos.look()) {
      switch(spot.type) {
        case LOOK_CONSTRUCTION_SITES:
        case LOOK_STRUCTURES:
          const s = spot[spot.type];
          if(s.structureType === STRUCTURE_CONTAINER) {
            this.memory.cont = s.id;
            return s;
          }
          break;
      }
    }
    return null;
  }
};
