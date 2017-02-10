Creep.prototype.roleGuard = function() {
    this.actionSelfHeal();
    return this.idleRetreat(TOUGH) ||
        this.actionTask() ||
        this.actionArcher(this.squad.flag.room) ||
        this.actionRoomHeal(this.squad.flag.room) ||
        this.idleTravel(this.squad.flag);
};

