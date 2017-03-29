Flag.prototype.roleGuard = function(spawn) {
  let body = [
    MOVE,
    TOUGH,
    MOVE,
    TOUGH,
    MOVE,
    RANGED_ATTACK,
    MOVE,
    HEAL,
    MOVE,
    RANGED_ATTACK,
    MOVE,
    RANGED_ATTACK,
  ];
  return this.createRole(spawn, body, {role: 'guard'});
};

Creep.prototype.roleGuard = function() {
    this.actionSelfHeal();
    return this.idleRetreat(TOUGH) ||
        this.actionTask() ||
        this.actionArcher(this.team.room) ||
        //this.actionRoomHeal(this.team.room) ||
        this.idleTravel(this.team);
};

