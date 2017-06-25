const util = require('util');
const lib = require('lib');

function findCont(positions) {
  for (let pos of positions) {
    const cont = _.find(
        pos.lookFor(LOOK_STRUCTURES), {structureType: STRUCTURE_CONTAINER});
    if (cont) return cont.id;
  }
  return false;
}

class CreepSrcer {
  roleSrcer() {
    // Calc src
    let src = Game.getObjectById(this.memory.src);
    if(!src) {
      const srcers = this.team.roleCreeps(this.memory.role);
      const srcs = this.room.find(FIND_SOURCES);
      if (srcers.length < 2) {
        src = this.pos.findClosestByRange(srcs);
        this.memory.src = src.id;
      } else if (srcers.length <= srcs.length) {
        for (let s of srcs) {
          let taken = false;
          for (let srcer of srcers) {
            if (srcer.name === this.name) {
              continue;
            }
            if (srcer.memory.src === s.id) {
              taken = true;
              break;
            }
          }
          if (!taken) {
            src = s;
          }
        }
        console.log('ERR', this.name, 'failed to find src in', this.pos.roomName);
      } else {
        const srcers = this.team.roleCreeps(this.memory.role);
        const creep = _.min(srcers, 'ticksToLive');
        if(!this.moveNear(creep)) {
          console.log('ERR', this.name, 'too many srcers in', this.pos.roomName);
        }
        return false;
      }
    }
    this.memory.src = src.id;

    // Start Behavior
    const what = this.taskTask() || this.movePos({pos:src.bestSpot});
    if (what) return what;

    const err = this.harvest(src);
    if(err === OK) {
      this.intents.melee = src;
    }
    this.dlog(`harvest ${err}`);
    
    this.idleNom();

    if(!this.carryCapacity) return src.energy;

    const shunted = this.srcerShunt(src);
    if(!shunted) {
      this.dlog(this, 'cleaning up srcer shunts');
      delete this.memory.spawn;
      delete this.memory.tower;
      delete this.memory.link;
      delete this.memory.store;
    }

    // Immortal Srcer
    const spawn = Game.getObjectById(this.memory.spawn);
    if(spawn && this.info.harvest > 10) {
      if(!this.room.energyFreeAvailable || this.ticksToLive < 100) {
        spawn.renewCreep(this);
      }
    }
  }

  srcerShunt(src) {
    let link = Game.getObjectById(this.memory.link);
    if(!link) {
      link = _.find(this.room.findStructs(STRUCTURE_LINK), l => this.pos.isNearTo(l));
    }
    if(link && link.mode === 'buffer' && link.energy > 250) {
      if(this.carryFree > this.info.harvest || !src.energy) {
        return this.goWithdraw(link, RESOURCE_ENERGY, false);
      }
    }

    if(this.carryFree < this.info.harvest && !src.energy) return 'space';

    let deficit = false;
      
    let tower = Game.getObjectById(this.memory.tower);
    if(!tower) {
      tower = _.find(this.room.findStructs(STRUCTURE_TOWER), t => this.pos.isNearTo(t));
    }
    if(tower) {
      this.memory.tower = tower.id;
      if(tower.energyFree > 10) {
        if(this.carry.energy) {
          return this.goTransfer(tower, RESOURCE_ENERGY, false);
        }
        deficit = true;
      }
    }

    let spawn = Game.getObjectById(this.memory.spawn);
    if(!spawn) {
      spawn = _.find(this.room.findStructs(STRUCTURE_SPAWN), s => this.pos.isNearTo(s));
    }
    if(spawn) {
      this.memory.spawn = spawn.id;
      if(spawn.energyFree) {
        if(this.carry.energy) {
          return this.goTransfer(spawn, RESOURCE_ENERGY, false);
        }
        deficit = true;
      }
    }

    if(link) {
      this.memory.link = link.id;
      if(deficit) { 
        if(link.energy) {
          return this.goWithdraw(link, RESOURCE_ENERGY, false);
        }
      } else if(link.mode === 'buffer') {
        if(this.carryFree && link.energy > 250) {
          return this.goWithdraw(link, RESOURCE_ENERGY, false);
        } else if(link.energy < 200) {
          if(this.carry.energy) {
            return this.goTransfer(link, RESOURCE_ENERGY, false);
          }
          deficit = true;
        }
      } else if(link.energyFree) {
        return this.goTransfer(link, RESOURCE_ENERGY, false);
      }
    }

    let store = Game.getObjectById(this.memory.store);
    if(!store) {
      store = this.room.myStorage || _.find(
          this.room.findStructs(STRUCTURE_CONTAINER),
          c => this.pos.isNearTo(c));
    }
    if(store) {
      this.memory.store = store.id;
      if(deficit) {
        if(this.carryFree) {
          return this.goWithdraw(store, RESOURCE_ENERGY, false);
        }
      } else {
        if(this.carry.energy) {
          return this.goTransfer(store, RESOURCE_ENERGY, false);
        }
      }
    }

    return "nothing";
  }

  afterSrcer() {
    this.idleBuild() || this.idleRepair();
  }
}

lib.merge(Creep, CreepSrcer);
