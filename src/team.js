function mkRoomPosition(obj) {
    return new RoomPosition(obj.x, obj.y, obj.roomName);
};

Flag.prototype.spawnDist = function(spawn) {
    const mem = this.memory = this.memory || {};
    return PathFinder.search(this.pos, spawn.pos).cost;
};

Flag.prototype.run = function() {
    if(this.color != COLOR_BLUE) {
        return;
    }
    const mem = this.memory = this.memory || {};
    const team = mem.team || "null";
    const fname = _.camelCase("team " + team);
    const fn = this[fname];
    this.dlog(fn.call(this));
};

Flag.prototype.teamNull = function() {
    console.log(this.name, "is teamNull");
    return "null";
};

Flag.prototype.spawnDist = function(spawn) {
    return PathFinder.search(this.pos, spawn.pos).cost;
};