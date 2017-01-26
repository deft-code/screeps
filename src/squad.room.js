const modsquads = require("squads");

class RoomSquad extends modsquads.Squad {
    constructor(name) {
        super(name);
    }
    
    execute() {
        if(!this.spawn) {
            return "no spawn";
        }
        const room = this.spawn.room;
        if(this.spawn.spawning) {
            return "spawning";
        }
        if(room.energyAvailable < room.energyCapacityAvailable) {
            return "need energy";
        }
        this.undertaker(this.memory.upgraders);
        if(this.memory.upgraders.length < this.memory.nupgraders) {
            this.roleUpgrader();
        }
        return "enough";
    }
    
    roleUpgrader() {
        let body = [
            MOVE, WORK, CARRY,
            MOVE, WORK, CARRY,
            MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
            MOVE, WORK, MOVE, WORK, MOVE, WORK, MOVE, WORK,
        ];        
        const who = this.createRole(body, 4, {role: "upgrader"});
        return this.trackCreep(this.memory.upgraders, who);
    }
    
    get sources() {
        return _.map(this.memory.sources, Game.getObjectById);
    }
}
modsquads.Squad.register(RoomSquad);

StructureSpawn.prototype.newRoomSquad = function() {
    const squad = this.room.name;
    const srcs = _.sortBy(
        this.room.cachedFind(FIND_SOURCES),
        s => s.pos.getRangeTo(this.pos));
    const mem = {
        sources: _.map(srcs, "id"),
        srcers: _.map(srcs, s => null),
        upgraders: [],
        nupgraders: 1,
    };
    return this.newSquad(squad, RoomSquad, mem);
}