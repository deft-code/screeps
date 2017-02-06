const modsquads = require('squads');

class AttackSquad extends modsquads.Squad {
  constructor(name) {
    super(name);
  }

  execute() {
   if (!this.spawn) {
      return 'no spawn';
    }
    if (this.spawn.spawning) {
      return 'spawning';
    }
    
    const room = this.spawn.room;
    
    if (room.energyAvailable < room.energyCapacityAvailable) {
      return 'need energy';
    }
    
    
    return this.upkeepRole("archer", 1) ||
        this.upkeepRole("caboose", 1);
        
    return 'enough';
  }
  
  roleCaboose() {
      let body = [
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
          MOVE, TOUGH, MOVE, HEAL, MOVE, HEAL,
      ];
      const nparts = this.memOr('nparts', body.length);
      body = body.slice(0, nparts);
      return this.createRole(body, 4, {role: 'caboose'});
  }

  roleArcher() {
    let body = [
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
        MOVE, TOUGH, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    ];
    const nparts = this.memOr('nparts', body.length);
    body = body.slice(0, nparts);
    return this.createRole(body, 4, {role: 'archer'});
  }
}
modsquads.Squad.register(AttackSquad);

StructureSpawn.prototype.newAttackSquad = function(name) {
  const squad = name;
  const mem = {
    flag: name,
  };
  return this.newSquad(squad, AttackSquad, mem);
};

Creep.prototype.roleCaboose = function() {
    return this.actionTask() ||
        this.actionCabooseFind() ||
        this.actionSelfHeal() ||
        this.idleMoveNear(this.squad.flag);
};

Creep.prototype.actionSelfHeal = function() {
    // Always return false;
    if(this.hurts) {
        this.heal(this);
    }
    return false;
};

Creep.prototype.actionCabooseFind = function() {
    if(this.squad.creeps.length < 2) {
        return false;
    }
    this.dlog("caboose find");
    for(let creep of this.squad.creeps) {
        if(creep.hostile) {
            return this.actionCaboose(creep);
        }
    }
    return false;
};

Creep.prototype.actionCaboose = function(creep) {
    this.dlog("actionCaboose", creep);
    if(!creep) {
        return false;
    }
    this.memory.task = {
        task: 'caboose',
        creep: creep.name,
    };
    return this.taskCaboose();
};

Creep.prototype.taskCaboose = function() {
    const creep = this.taskCreep;
    this.dlog("task caboose", creep);
    if(!creep) {
        if(this.hurts) {
            this.heal(this);
        }
        return false;
    }
    if(creep.hurts > this.hurts) {
        if(this.pos.isNearTo(creep)) {
            this.heal(creep);
        } else if(this.pos.inRangeTo(creep, 3)) {
            this.rangedHeal(creep);
        } else if(this.hurts) {
            this.heal(this);
        }
        this.heal(creep)
    } else if(this.hurts) {
        this.heal(this);
    }
    
    if(this.pos.inRangeTo(creep, 3)) {
        this.move(this.pos.getDirectionTo(creep));
        return "nudge";
    } else {
        this.actionMoveTo(creep);
        return "chase";
    }
};

Creep.prototype.roleArcher = function() {
    return this.actionTask() ||
        this.actionArcher(this.squad.flag.room) ||
        this.idleMoveNear(this.squad.flag);
};

Creep.prototype.actionArcher = function(room) {
  if(!room) return false;

    const hostiles = room.hostiles;
    if(hostiles.length) {
        return this.actionKite(this.pos.findClosestByRange(hostiles));
    }
    
    const enemy = _.find(room.enemies,
      c => c.getActiveBodyparts(CLAIM) || c.getActiveBodyparts(CARRY) > 1);
    return this.actionKite(enemy);
};

Creep.prototype.actionKite = function(creep) {
    if(!creep) return false;

    this.memory.task = {
        task: 'kite',
        id: creep.id,
    };
    return this.taskKite();
};

Creep.prototype.idleFlee = function(creeps, range) {
  const ret = PathFinder.search(
    this.pos,
    _.map(creeps, creep => ({pos: creep.pos, range: range})),
    {flee: true});

  const next = _.first(ret.path);
  if(!next) return false;

  const err = this.move(this.pos.getDirectionTo(next));
  if(err == OK) return `flee ${next.x} ${next.y}`;

  return false;
};

Creep.prototype.idleAway = function(creep) {
  if(!creep) return false;

  const dir = this.pos.getDirectionAway(creep);
  const err = this.move(dir);
  if(err == OK) return `move away ${dir}`;

  return false;
};

Creep.prototype.taskKite = function() {
  const creep = this.taskId;
  if(!creep) return false;

  if(this.room.hostiles.length && !creep.hostile) {
    this.actionKite(_.first(this.room.hostiles));
  }

  const range = this.pos.getRangeTo(creep);
  let err = ERR_NOT_IN_RANGE;
  switch(range) {
    case 1:
      err = this.rangedMassAttack(creep);
      break;
    case 2:
    case 3:
      err = this.rangedAttack(creep);
      break;
    default:
      return this.idleMoveTo(creep);
  }

  if(err == OK) {
      if(creep.hostile) {
        if(range < 3) {
          return this.idleFlee(this.room.hostiles, 3);
        }
      } else {
        if(range > 1) {
          return this.idleMoveTo(creep);
        }
      }
      return "stay";
  }
  return false;
};

Creep.prototype.actionMassAttackStructs = function(structType) {
    const s = this.room.cachedFind(FIND_HOSTILE_STRUCTURES);
    const targets = _.filter(s, s => s.structureType == structType);
    return this.actionMassAttackStruct(_.sample(targets));
};

Creep.prototype.actionMassAttackStruct = function(struct) {
    if(!struct) {
        return false;
    }
    
    this.memory.task = {
        task: 'mass attack struct',
        id: struct.id,
        note: struct.note,
    };
    return this.taskMassAttackStruct();
};

Creep.prototype.taskMassAttackStruct = function() {
    const struct = this.taskId;
    if(!struct) {
        return false;
    }
    if(this.room.hostiles.length) {
        return false;
    }
    if(this.pos.isNearTo(struct)) {
        this.rangedMassAttack();
        return "bang";
    }
    return this.actionMoveTo(struct);
};

Creep.prototype.actionRangedAttackStruct = function(struct) {
    if(!struct) {
        return false;
    }
    this.memory.task = {
        task: "ranged attack struct",
        id: struct.id,
    };
    return this.taskRangedAttackStruct();
};

Creep.prototype.taskRangedAttackStruct = function() {
    const struct = this.taskId;
    const err = this.rangedAttack(struct);
    if(err == ERR_NOT_IN_RANGE) {
        return this.idleMoveTo(struct);
    }
    if(err == OK) return struct.hits;

    return false;
};
