
Room.prototype.lookup = function(memkey) {
    const name = memkey.slice(1);
    switch(memkey[0]) {
        case "f":
            return Game.flags[name];
        case "c":
            return Game.creeps[name];
        case "r":
            return Game.rooms[name];
        case "s":
            return null;
    }
}


modutil.cachedProp(RoomObject, "memkey", function() { return this.id; });
modutil.cachedProp(Structure, "memkey", function() { return this.})
    RoomObject.prototype.memkey



module.exports = {

};