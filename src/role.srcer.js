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
  if (err == OK) {
    return src.energy + 1;
  }
  return false;
};
