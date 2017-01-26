const modsquads = require("squads");

class FarmSquad extends modsquads.Squad {
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
        this.undertaker(this.memory.farmers);
        if(this.memory.farmers.length < this.memory.nfarmers) {
            return this.roleFarmer();
        }
        this.undertaker(this.memory.reservers);
        if(!this.farm) {
            return "enough";
        }
        const nreservers = this.memory.nreservers || this.farm.cachedFind(FIND_SOURCES).length - 1;
        
        if(this.memory.reservers.length < nreservers) {
            console.log("Squad", this.name, this.memory.reservers, nreservers);
            return this.roleReserver();
        }
        return "enough";
    }
    
    roleFarmer() {
        let body = [
            MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
            MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
            MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
            MOVE, WORK, MOVE, CARRY, MOVE, CARRY,
        ];        
        const who = this.createRole(body, 4, {role: "farmer"});
        return this.trackCreep(this.memory.farmers, who);
    }
    
    roleReserver() {
        let body = [ MOVE, MOVE, CLAIM, CLAIM ];
        const who = this.createRole(body, 4, {role: "reserver"});
        return this.trackCreep(this.memory.reservers, who);
        
    }
    
    get farm() {
        return (this.flag || {}).room;
    }
    
    get flag() {
        return Game.flags[this.memory.flag];
    }
}
modsquads.Squad.register(FarmSquad);

StructureSpawn.prototype.newFarmSquad = function(name) {
    const squad = name;
    const mem = {
        flag: name,
        farmers: [],
        nfarmers: 1,
        reservers: [],
    };
    return this.newSquad(squad, FarmSquad, mem);
}

Creep.prototype.roleReserver = function() {
    return this.actionTask() ||
        this.actionTravel(this.squad.flag) ||
        this.actionReserve(this.squad.farm);
}

Creep.prototype.roleFarmer = function() {
    return this.idleNom() ||
        this.actionHospital() ||
        this.actionTask() ||
        (!this.carryTotal && this.actionTravel(this.squad.flag)) ||
        this.actionRepairStruct(STRUCTURE_ROAD, this.squad.farm) ||
        this.actionBuildStruct(STRUCTURE_ROAD, this.squad.farm) ||
        ((this.carryFree > this.carryTotal) && this.actionHarvestAny(this.squad.farm)) ||
        this.actionStore(this.squad.home.storage) ||
        this.actionStoreAny(this.squad.home);
}