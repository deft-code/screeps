const lib = require('lib');

class CreepArcher {
  roleArcher() {
    return this.taskTask() || this.taskArcher() ||
        this.moveNear(this.team);
  }

  taskArcher() {
    const hostiles = this.room.hostiles;
    if (hostiles.length) {
      return this.taskKite(this.pos.findClosestByRange(hostiles));
    }

    return this.taskKite(_.sample(this.room.enemies));
  }

  taskKite(creep) {
    creep = this.checkId('kite', creep);
    if (!creep) return false;
    if (!creep.hostile) return false;

    const range = this.pos.getRangeTo(creep);
    let err = ERR_NOT_IN_RANGE;
    switch (range) {
      case 1:
        err = this.rangedMassAttack(creep);
        break;
      case 2:
      case 3:
        err = this.goRangedAttack(creep, false);
        break;
      default:
        return this.moveRange(creep);
    }

    if (err === OK) {
      if (creep.hostile) {
        if (range < 3) {
          return this.idleFlee(this.room.hostiles, 3);
        }
      } else {
        if (range > 1) {
          return this.idleMoveTo(creep);
        }
      }
      return 'stay';
    }
    return false;
  }
}

lib.merge(Creep, CreepArcher);
