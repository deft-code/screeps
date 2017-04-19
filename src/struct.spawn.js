const util = require('util');
const lib = require('lib');

class Spawn {
  run() {
    if (this.spawning) {
      const mem = Memory.creeps[this.spawning.name];
      this.dlog(
          'Spawning', JSON.stringify(this.spawning), mem.role,
          mem.team || mem.squad);
    } else {
      this.dlog('Start Spawning', this.dequeueRole());
    }
  }

  dequeueRole() {
    if (!this.nextRole) {
      return false;
    }
    const fname = _.camelCase('role ' + this.nextRole.role);
    const fn = this.nextRole.obj[fname];
    if (!fn) {
      console.log('Bad enqueued role', JSON.stringify(obj));
      return false;
    }
    return fn.call(this.nextRole.obj, this);
  }

  enqueueRole(obj, role, priority) {
    if (this.spawning) return false;

    if (!this.nextRole || !this.nextRole.priority > priority) {
      this.nextRole = {
        obj: obj,
        role: role,
        priority: priority,
      };
      return true;
    }
    return false;
  }

  createRole(body, memory) {
    memory.spawn = this.name;
    memory.birth = Game.time;
    let myParts = body;
    while (lib.partsCost(myParts) > this.room.energyAvailable) {
      myParts.pop();
    }
    const optParts = util.optimizeBody(myParts);
    this.dlog('spawning', JSON.stringify(memory), optParts);
    return this.createCreep(optParts, undefined, memory);
  }
}

lib.merge(StructureSpawn, Spawn);
