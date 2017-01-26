const modsquads = require("squads");

class CartSquad extends modsquads.Squad {
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
        this.undertaker(this.memory.Carters);
        if(this.memory.Carters.length < this.memory.nCarters) {
            return this.roleCarter();
        }
        return "enough";
    }
    
    roleCartPump() {
        let body = [CARRY, MOVE, WORK, WORK, WORK];
        const who = this.createRole(body, 4, {role: "cart pump"});
        return this.trackCreep(this.memory.pumps, who);
    }
    
    get remote() {
        return this.flag.room;
    }
    
    get flag() {
        return Game.flags[this.memory.flag];
    }
}
modsquads.Squad.register(CartSquad);


StructureSpawn.prototype.newCartSquad = function(name) {
    const squad = name;
    const mem = {
        flag: name,
        Carters: [],
        nCarters: 1,
    };
    return this.newSquad(squad, CartSquad, mem);
}

Creep.prototype.roleCartPump = function() {
    return this.idleNom() ||
        this.actionTask() ||
        this.actionTravel(this.squad.flag) ||
        this.actionRepairStruct(STRUCTURE_ROAD, this.squad.Cart) ||
        this.actionBuildStruct(STRUCTURE_ROAD, this.squad.Cart) ||
        this.actionHarvestAny(this.squad.Cart) ||
        this.actionStoreAny(this.squad.home);
}