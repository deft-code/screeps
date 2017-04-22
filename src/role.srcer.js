const util = require('util');
const lib = require('lib');

Flag.prototype.roleSrcer = function(spawn) {
  const body = [MOVE, WORK, WORK, CARRY, WORK, WORK, WORK, WORK, MOVE, MOVE];
  return this.createRole(spawn, body, {role: 'srcer'});
};

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
    const what = this.taskTask() || this.taskTravelFlag(this.team);
    if (what) return what;

    const srcers = this.team.roleCreeps(this.memory.role);
    const room = this.team.room;
    const srcs = room.find(FIND_SOURCES);

    if (srcers.length < 2) {
      return this.taskSrc(
          this.pos.findClosestByRange(this.room.find(FIND_SOURCES_ACTIVE)));
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
          return this.taskSrc(src);
        }
      }
      console.log('ERR', this.name, 'failed to find src in', room);
      return false;
    }
    return false;
  }

  startShunt(...positions) {
    this.dlog('shunting in ', positions[0], positions[0].roomName);
    const room = Game.rooms[positions[0].roomName];

    if (!room) return false;

    this.dlog('room is', room);

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
                        .sortBy(s => order.indexOf(s.structureType))
                        .map('id')
                        .value();

    this.memory.task.shunt = structs;
  }

  idleShunt() {
    const shunt = this.memory.task.shunt;
    if (!shunt) return false;

    const moveTo = (struct, err) => {
      this.dlog('shunt moveTo', struct, err);
      if (!this.intents.move && err == ERR_NOT_IN_RANGE) {
        this.dlog('moving', struct);
        this.idleMoveNear(struct);
      }
      return err == -OK;
    };

    let deficit = false;

    for (let id of shunt) {
      if (this.intents.xfer && this.intents.withdraw) {
        this.dlog('done shunting');
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
          if (this.intents.xfer || struct.energyFree < 25) break;
          this.dlog('energy check', struct);
          deficit = struct.energyFree > this.carry.energy;
          if (!this.carry.energy) break;
          this.dlog('filling', struct);
          this.intents.xfer =
              moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
          break;
        case STRUCTURE_LINK:
          if (struct.mode === 'buffer') {
            this.dlog('shunting link buffer', struct);
            if (struct.energy > 250) {
              this.dlog('clearing link buffer', struct);
              this.intents.withdraw =
                  moveTo(struct, this.withdraw(struct, RESOURCE_ENERGY));
            } else if (struct.energy < 200) {
              if (this.room.storage &&
                  this.room.storage.store.energy <
                      2 * this.room.energyCapacityAvailable) {
                this.dlog(
                    'Storage is too low',
                    JSON.stringify(this.room.storage.store));
              } else {
                this.dlog('filling link buffer', struct);
                this.intents.xfer =
                    moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
              }
            }
            break;
          }

          if (deficit) {
            if (this.intents.withdraw || !struct.energy) break;
            this.dlog('withdraw', struct);
            this.intents.withdraw =
                moveTo(struct, this.withdraw(struct, RESOURCE_ENERGY));
            break;
          }

          if (this.intents.xfer) break;
          this.intents.xfer =
              moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
          break;
        case STRUCTURE_STORAGE:
        case STRUCTURE_CONTAINER:
          if (deficit) {
            if (this.intents.withdraw || !struct.store.energy) break;
            this.intents.withdraw =
                moveTo(struct, this.withdraw(struct, RESOURCE_ENERGY));
            break;
          }

          if (this.intents.xfer) break;

          this.dlog('xfer to', struct);
          this.intents.xfer =
              moveTo(struct, this.transfer(struct, RESOURCE_ENERGY));
          break;
      }
    }
  }

  taskSrc(src) {
    this.dlog('taskSrc');
    src = this.checkId('src', src);

    const err = this.harvest(src);
    if (err == ERR_NOT_IN_RANGE ||
        err == ERR_NOT_ENOUGH_RESOURCES && !this.pos.isNearTo(src)) {
      return this.idleMoveTo(src);
    }
    if (this.getActiveBodyparts(CARRY)) {
      this.idleNom();
      const shunt = this.memory.task.shunt;
      if (!shunt) {
        this.startShunt(...src.spots);
      }
      this.idleShunt();
    } else {
      let contid = this.memory.task.cont;
      if (contid === undefined) {
        contid = this.memory.task.cont = findCont(src.spots);
      }
      if (contid) {
        const cont = Game.getObjectById(contid);
        if (!cont) {
          delete this.memory.task.cont;
        } else {
          this.dlog('adjusting');
          this.idleMoveTo(cont);
        }
      }
    }
    if (this.getActiveBodyparts(WORK) > 5 &&
        this.room.energyAvailable == this.room.energyCapacityAvailable) {
      for (let spawn of this.room.findStructs(STRUCTURE_SPAWN)) {
        const err = spawn.renewCreep(this);
        if (err === OK || err === ERR_FULL) {
          break;
        }
      }
    }
    if (err == OK) {
      return src.energy + 1;
    }
    return false;
  }
}

lib.merge(Creep, CreepSrcer);
