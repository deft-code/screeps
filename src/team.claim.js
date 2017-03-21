const util = require('util');

Flag.prototype.teamClaim = function() {
  if (!this.room) return 'no room';

  if (this.room.storage) {
    if (!this.creeps.length) {
      this.remove();
      return 'removed';
    }
    return 'done';
  }

  let min = 100;
  _.each(Game.spawns, spawn => {
    if (spawn.room.controller.level < 3) return;
    if (spawn.room.controller.level <= this.room.controller.level) return;
    min = Math.min(this.spawnDist(spawn), min);
  });

  const nremote = 5 - this.room.controller.level;
  const e = this.room.energyCapacityAvailable + 1;
  const d = min + 3;

  const hurt = _.any(this.room.find(FIND_MY_CREEPS), 'hurts');
  return this.upkeepRole('remote build', nremote, e, 0, d) ||
      hurt && this.upkeepRole('medic', 1, e, 1, d);
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

Creep.prototype.roleRemoteBuild = function() {
  if (this.room.name == this.team.pos.roomName) this.idleNom();

  return this.actionTask() || this.actionTravelFlag(this.team) ||
      this.actionBuildRoom(this.team.room) ||
      this.actionUpgrade(this.team.room) ||
      this.taskHarvestAny(this.team.room) || this.idleMoveNear(this.team);
};
