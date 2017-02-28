const util = require('util');

Flag.prototype.teamClaim = function() {
  this.dlog("my creeps", this.creeps.length, this.creeps);
  let nremote = 1;
  if(this.room) {
    if(this.room.controller.level > 4) {
      nremote = 0;
    } else if(this.room.controller.level < 4) {
      nremote = 2;
    }
  }
  const hurt = _.any(this.creeps, "hurts");
  return this.upkeepRole("remote build", nremote, 800, 0, 3) ||
    hurt && this.upkeepRole("medic", 1, 800, 1, 3);
};

Flag.prototype.roleRemoteBuild = function(spawn) {
  const body = [
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
    MOVE, WORK, MOVE, WORK, CARRY, MOVE, WORK, MOVE, WORK, CARRY,
  ];
  return this.createRole(spawn, body, {role: 'remote build'});
};

Creep.prototype.roleClaim = function() {
  let f = Game.flags.claim;
  if (!f) return false;

  if (this.pos.roomName === f.pos.roomName) {
    const err = this.claimController(this.room.controller);
    if (err == ERR_NOT_IN_RANGE) {
      return this.idleMoveTo(this.room.controller);
    }
  }
  return this.idleMoveNear(f);
};

StructureSpawn.prototype.roleClaim = function() {
  const body = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
  return this.createRole(body, 2, {role: 'claim'});
};

Creep.prototype.actionHarvestAny = function(room) {
  if(!room) return false;

  //const src = util.pickClosest(this.pos, room.find(FIND_SOURCES_ACTIVE));
  const src = _.sample(room.find(FIND_SOURCES_ACTIVE));
  return this.actionHarvest(src);
};

Creep.prototype.actionHarvest = function(src) {
  if (!src) return false;

  this.memory.task = {
    task: 'harvest',
    id: src.id,
    note: 'src' + src.pos.x + src.pos.y,
  };
  this.say(this.memory.task.note);
  return this.taskHarvest();
};

Creep.prototype.taskHarvest = function() {
  if (!this.carryFree) return false;

  const src = this.taskId;
  if (!src || !src.energy) {
    return false;
  }
  return this.doHarvest(src) && src.energy + 1;
};

Creep.prototype.roleRemoteBuild = function() {
  if(this.room.name == this.team.pos.roomName) this.idleNom();

  return this.actionTask() ||
      this.actionTravelFlag(this.team) ||
      this.actionBuildRoom(this.team.room) ||
      this.actionUpgrade(this.team.room) ||
      this.actionHarvestAny(this.team.room) ||
      this.idleMoveNear(this.team);
};
