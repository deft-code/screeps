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
    
      const archers = this.roleCreeps("archer");
      const narchers = this.memory.narchers || 1;
      if(archers.length < narchers) {
          return this.roleArcher();
      }
      
      const cabooses = this.roleCreeps("caboose");
      const ncabooses = this.memory.ncabooses || 1;
      if(cabooses.length < ncabooses) {
          return this.roleCaboose();
      }
      
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
        this.actionTravelFlag(this.squad.flag) ||
        this.actionMoveFlag(this.squad.flag)
}

Creep.prototype.actionSelfHeal = function() {
    // Always return false;
    if(this.hurts) {
        this.heal(this);
    }
    return false;
}

Creep.prototype.actionCabooseFind = function() {
    if(this.squad.creeps.length < 2) {
        return false;
    }
    this.dlog("caboose finde");
    for(let creep of this.squad.creeps) {
        if(creep.armed) {
            return this.actionCaboose(creep);
        }
    }
    return false;
}

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
        this.actionTravelFlag(this.squad.flag) ||
        this.actionArcher() ||
        this.actionMoveFlag(this.squad.flag);
};

Creep.prototype.actionArcher = function() {
    const hostiles = this.room.hostiles;
    if(hostiles.length) {
        return this.actionKite(this.pos.findClosestByRange(hostiles));
    }
    
    const enemies = this.room.cachedFind(FIND_HOSTILE_CREEPS);
    return this.actionKite(_.sample(enemies));
};

Creep.prototype.actionKite = function(creep) {
    if(!creep) {
        return false;
    }
    this.memory.task = {
        task: 'kite',
        id: creep.id,
    };
    return this.taskKite();
};

Creep.prototype.taskKite = function() {
    const creep = this.taskId;
    if(!creep) {
        return false;
    }
    const err = this.rangedAttack(creep);
    if(err == ERR_NOT_IN_RANGE) {
        return this.actionMoveTo(creep);
    }
    if(err == OK) {
        if(!this.pos.inRangeTo(creep, 2)) {
            this.move(this.pos.getDirectionTo(creep));
            return "moved";
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
        return this.actionMoveTo(struct);
    }
    if(err == OK) {
        return struct.hits;
    }
    return false;
};