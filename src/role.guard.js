Creep.prototype.roleGuard = function() {
    this.actionSelfHeal();
    return this.idleRetreat(TOUGH) ||
        this.actionTask() ||
        this.actionArcher(this.team.room) ||
        //this.actionRoomHeal(this.team.room) ||
        this.idleTravel(this.team);
};

