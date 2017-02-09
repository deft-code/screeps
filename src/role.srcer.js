const modutil = require('util');

Creep.prototype.roleSrcer = function() {
  return this.actionTask() || this.actionStartSrc()
};

Creep.prototype.actionStartSrc = function() {
  const srcers = this.squad.roleCreeps(this.memory.role);
  const home = this.home;
  const srcs = home.cachedFind(FIND_SOURCES);

  if (srcers.length <= srcs.length) {
    for (let src of srcs) {
      let taken = false;
      for (let srcer of srcers) {
        if (srcer.name === this.name) {
          continue;
        }
        if (srcer.taskId.id === src.id) {
          taken = true;
          break;
        }
      }
      if (!taken) {
        return this.actionSrc(src);
      }
    }
    console.log('ERR', this.name, 'failed to find src in', this.home.name);
    return false;
  }

  return this.actionReplaceOldest(srcers);  // || this.actionRecycle();
};

Creep.prototype.actionSrc = function(src) {
  if (!src) {
    return false;
  }
  this.memory.task = {
    task: 'src',
    id: src.id,
    note: modutil.structNote('src', src.pos),
  };
  return this.taskSrc();
};

Creep.prototype.startShunt = function(...positions) {
  const room = Game.rooms[positions[0].roomName];
  if (!room) return false;

  const order = [
    STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_LINK, STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION, STRUCTURE_TOWER
  ];

  const structs = _(room.find(FIND_STRUCTURES))
                      .filter(
                          s => _.any(positions, pos => pos.isNearTo(s)) &&
                              _.contains(order, s.structureType))
                      .sort(
                          (l, r) => order.indexOf(l.structureType) -
                              order.indexOf(r.structureType))
                      .map('id')
                      .value();

  this.memory.task.shunt = structs;
};

Creep.prototype.idleShunt = function() {
  const shunt = this.memory.task.shunt;
  if (!shunt) return false;

  let xfer = false;
  let deficit = false;
  let withdraw = false;
  let move = false;

  const moveTo = (struct, err) => {
    if (!move && err == ERR_NOT_IN_RANGE) {
      this.idleMoveNear(struct);
      move = true;
    }
    return err == OK;
  };

  for (let id of shunt) {
    if (xfer && withdraw) {
      break;
    }
    const struct = Game.getObjectById(id);
    if (!struct) {
      console.log('Broken Shunt!');
      delete this.memory.task.shunt;
      return;
    }
    switch (struct.structureType) {
      case STRUCTURE_TOWER:
      case STRUCTURE_SPAWN:
      case STRUCTURE_EXTENSION:
        if (xfer) break;
        if (this.energyFree < this.energy && struct.energyFree < this.energy) {
          break;
        }
        deficit = struct.energyFree > this.energy;
        xfer = moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
        break;
      case STRUCTURE_LINK:
        if (deficit) {
          if (withdraw || !struct.energy) break;
          withdraw = moveTo(struct, this.withdraw(struct, RESOURCE_ENERGY));
          break;
        }

        if (xfer) break;
        xfer = moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
        break;
      case STRUCTURE_STORAGE:
      case STRUCTURE_CONTAINER:
        if (deficit) {
          if (withdraw || !struct.store.energy) break;
          withdraw = moveTo(struct, this.withdraw(struct, RESOURCE_ENERGY));
          break;
        }

        if (xfer) break;
        xfer = moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
        break;
    }
  }
};

Creep.prototype.taskSrc = function() {
  this.dlog('taskSrc');
  const src = this.taskId;
  if (!src) {
    return false;
  }
  const err = this.harvest(src);
  if (err == ERR_NOT_IN_RANGE || err == ERR_NOT_ENOUGH_RESOURCES) {
    return this.idleMoveTo(src);
  }
  if (this.carry) {
    if (false) {
      this.idleNom();
      const shunt = this.memory.task.shunt;
      if (!shunt) {
        this.startShunt(src.spots);
      }
      this.idleShunt();
    }
    if (true) {
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
