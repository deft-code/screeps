const modutil = require('util');

Creep.prototype.roleSrcer = function() {
  return this.actionTask() ||
    this.actionTravelFlag(this.team) ||
    this.actionStartSrc();
};

Creep.prototype.actionStartSrc = function() {
  const srcers = this.squad.roleCreeps(this.memory.role);
  const home = this.home;
  const srcs = home.find(FIND_SOURCES);

  if( srcers.length === 0) {
    return this.actionSrc(this.pos.findClosestByRange(srcs));
  }

  if (srcers.length <= srcs.length) {
    for (let src of srcs) {
      let taken = false;
      for (let srcer of srcers) {
        if (srcer.name === this.name) {
          continue;
        }
        if (srcer.taskId && srcer.taskId.id === src.id) {
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
  this.dlog("shunting in ", positions[0], positions[0].roomName);
  const room = Game.rooms[positions[0].roomName];

  if (!room) return false;

  this.dlog("room is", room);

  const order = [
    STRUCTURE_TOWER,
    STRUCTURE_EXTENSION,
    STRUCTURE_SPAWN,
    STRUCTURE_LINK,
    STRUCTURE_STORAGE,
    STRUCTURE_CONTAINER,
  ];

  const structs = _(room.find(FIND_STRUCTURES))
                      .filter(
                          s => _.any(positions, pos => pos.isNearTo(s)) &&
                              _.contains(order, s.structureType))
                      .sortBy(s=> order.indexOf(s.structureType))
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
    this.dlog("shunt moveTo", struct, err);
    if (!move && err == ERR_NOT_IN_RANGE) {
      this.dlog("moving", struct);
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
    this.dlog("shunting", struct);
    if (!struct) {
      console.log('Broken Shunt!');
      delete this.memory.task.shunt;
      return;
    }
    switch (struct.structureType) {
      case STRUCTURE_TOWER:
      case STRUCTURE_SPAWN:
      case STRUCTURE_EXTENSION:
        if (xfer || !this.energFree) break;
        this.dlog("energy check", struct);
        if (this.energyFree < this.energy && struct.energyFree < this.energy) {
          break;
        }
        deficit = struct.energyFree > this.energy;
        this.room.visual.line(this.pos, struct.pos);
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

        this.dlog("xfer to", struct);
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
  if (err == ERR_NOT_IN_RANGE || err == ERR_NOT_ENOUGH_RESOURCES && !this.pos.isNearTo(src)) {
    return this.idleMoveTo(src);
  }
  if (this.carry) {
    if (true) {
      this.idleNom();
      const shunt = this.memory.task.shunt;
      if (!shunt) {
        this.startShunt(...src.spots);
      }
      this.idleShunt();
    }
  }
  if (err == OK) {
    return src.energy + 1;
  }
  return false;
};
