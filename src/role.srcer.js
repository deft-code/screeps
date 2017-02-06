const modutil = require('util');

Creep.prototype.roleSrcer = function() {
    return this.actionTask() ||
        this.actionStartSrc()
};

Creep.prototype.actionStartSrc = function() {
    const srcers = this.squad.roleCreeps(this.memory.role);
    const home = this.home;
    const srcs = home.cachedFind(FIND_SOURCES);
    
    if(srcers.length <= srcs.length) {
        for(let src of srcs) {
            let taken = false;
            for(let srcer of srcers) {
                if(srcer.name === this.name) {
                    continue;
                }
                if(srcer.taskId.id === src.id) {
                    taken = true;
                    break;
                }
            }
            if(!taken) {
                return this.actionSrc(src);
            }
        }
        console.log("ERR", this.name, "failed to find src in", this.home.name);
        return false;
    }
    
    return this.actionReplaceOldest(srcers); // || this.actionRecycle();
};

Creep.prototype.actionSrc = function(src) {
    if(!src) {
        return false;
    }
    this.memory.task = {
        task: "src",
        id: src.id,
        note: modutil.structNote("src", src.pos),
    };
    return this.taskSrc();
};

Creep.prototype.startShunt = function(...positions) {
  const room = Game.rooms[positions[0].roomName];
  if(!room) return false;

  const byType = _(room.cachedFind(FIND_STRUCTURES))
    .filter(s => _.any(positions, pos => pos.isNearTo(s)))
    .groupBy("structureType");

  const sTypes = [
    STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION,
    STRUCTURE_LINK,
    STRUCTURE_STORAGE, STRUCTURE_CONTAINER,
  ];
  
  const structs = _(sTypes)
      .map(sType => _.map(byType[sType] || [], "id"))
      .flatten()
      .value();
    
  this.memory.task.shunt = {
    positions: positions,
    structs: structs,
  };
};

Creep.prototype.idleShunt = function() {
  const shunt = this.memory.task.shunt;
  if(!shunt ) return false;

  const positions = _.map(shunt.positions, RoomPosition.FromMem);
  let xfer = false;
  let deficit = false;
  let withdraw = false;
  let move = false;

  const moveTo = (struct, err) => {
      if(!move && err == ERR_NOT_IN_RANGE) {
        const p = _.filter(positions, p => p.isNearTo(struct));
        this.move(this.pos.getDirectionTo(p));
        move = true;
      }
      return err == OK;
  };

  for(let id of this.shunt.structs) {
    if(xfer && withdraw) {
      break;
    }
    const struct = Game.getObjectById(id);
    if(!struct) {
      console.log("Broken Shunt!");
      delete this.memory.task.shunt;
      return;
    }
    switch(struct.structureType) {
      case STRUCTURE_TOWER:
      case STRUCTURE_SPAWN: 
      case STRUCTURE_EXTENSION: 
        if(xfer) break;
        deficit = struct.energyFree > this.energy;
        xfer = moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
        break;
      case STRUCTURE_LINK:
        if(deficit) {
          if(withdraw || !struct.energy) break;
          withdraw = moveTo(struct, this.withdraw(struct, RESOURCE_ENERGY));
          break;
        }

        if(xfer) return;
        xfer = moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
        break;
      case STRUCTURE_STORAGE:
      case STRUCTURE_CONTAINER:
        if(deficit) {
          if(withdraw || !struct.store.energy) break;
          withdraw = moveTo(struct, this.withdraw(struct, RESOURCE_ENERGY));
          break;
        }

        if(xfer) return;
        xfer = moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
        break;
    }
  }
  // TODO pickup dropped resources.
};

Creep.prototype.taskSrc = function() {
    this.dlog("taskSrc");
  const src = this.taskId;
  if (!src) {
    return false;
  }
  const err = this.harvest(src);
  if (err == ERR_NOT_IN_RANGE || err == ERR_NOT_ENOUGH_RESOURCES) {
    return this.actionMoveTo(src);
  }
  if (this.carry) {
    if(false) {
      let shunt = this.memory.task.shunt;
      this.dlog("srcer", JSON.stringify(shunt));
      if(!shunt && !this.carryFree) {
        let spots = src.room.lookAtArea(src.pos.x-1, src.pos.y-1, src.pos.x+1, src.pos.y+1);
        let positions = [];
        for(let x in spots) {
          for( let y in spots[x]) {
            let blocked = false;
            for(let entry of spots[x][y]) {
              if(entry.type === 'terrain' && entry.terrain === 'wall') {
                blocked = true;
                break;
              }
              if(entry.type === 'structure' && entry.structure.obstacle) {
                blocked = true;
                break;
              }
            }
            if(!blocked) {
              positions.push(src.room.getPositionAt(x, y));
            }
          }
        }
        this.startShunt(positions);
      }

      this.idleShunt();
    } else {
      let bucket = Game.getObjectById(this.memory.task.bucket);
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
  }
  if (err == OK) {
    return src.energy + 1;
  }
  return false;
};

