let modutil = require('util');

Creep.prototype.actionBuildFinish = function(sites) {
    if(!sites) {
        sites = this.room.cachedFind(FIND_MY_CONSTRUCTION_SITES);
    }
    const byProgress = _.groupBy(sites, "progress");
    const max = _.max(_.keys(byProgress));
    const site = this.pos.findClosestByRange(byProgress[max]);
    return this.actionBuild(site);
}

Creep.prototype.actionBuildStruct = function(structureType, room) {
    room = room || this.home;
    const sites = _.filter(
        room.cachedFind(FIND_MY_CONSTRUCTION_SITES),
        site => site.structureType == structureType);
    return this.actionBuildFinish(sites);
}

Creep.prototype.actionBuildNear = function() {
    const sites = _.filter(
        this.home.cachedFind(FIND_MY_CONSTRUCTION_SITES),
        s => this.pos.inRangeTo(s, 3));
    return this.actionBuildFinish(sites);
}

Creep.prototype.actionBuild = function(site) {
    if(!site) {
        return false;
    }
    this.memory.task = {
        task: "build",
        build: site.id,
        note: modutil.structNote(site.structureType, site.pos),
    };
    this.say(this.memory.task.note);
    
    return this.taskBuild();
}

Creep.prototype.taskBuild = function() {
    let site = Game.getObjectById(this.memory.task.build);
    if(!site) {
        return this.actionBuildNear();
    }
    if(this.carry.energy == 0) {
        this.say("recharge");
        this.actionRecharge(this.carryCapacity, site.pos);
    }
    const err = this.build(site);
    if(err == ERR_NOT_IN_RANGE) {
        return this.actionMoveTo(site);
    }
    if(err == OK) {
        this.actionDoubleTime();
        return "building";
    }
    return false;
}

Creep.prototype.actionDismantleAny = function() {
    if(!this.carryFree) {
        return false;
    }
    const target = _(this.room.cachedFind(FIND_STRUCTURES))
        .filter(s => s.memory.dismantle)
        .sample(3)
        .sortBy("hits")
        .first();
    return this.actionDismantle(target);
}

Creep.prototype.actionDismantle = function(struct) {
    if(!struct) {
        return false;
    }
    if(!this.carryFree) {
        return false;
    }
    this.memory.task = {
        task: "dismantle",
        id: struct.id,
        note: struct.note,
    };
    return this.taskDismantle();
}

Creep.prototype.taskDismantle = function() {
    if(!this.carryFree) {
        this.say("Full");
        return false;
        //return this.actionUpgrade();
    }
    let structure = this.taskId;
    if(!structure || (structure.my && !structure.memory.dismantle)) {
        return false;
    }
    let err = this.dismantle(structure);
    if(err == ERR_NOT_IN_RANGE) {
        return this.actionMoveTo(structure);
    }
    if(err == OK) {
        return structure.hits;
    }
    return false;
}

Creep.prototype.actionRepairAny = function() {
    const room = Game.rooms[this.memory.home] || this.room;
    const target = _(room.cachedFind(FIND_STRUCTURES))
        .filter(s => s.repairs > 0 && !s.memory.dismantle)
        .sample(3)
        .sortBy("repairs")
        .last();
        
    return this.actionRepair(target);
}

Creep.prototype.actionRepairStruct = function(structureType, room) {
    room = room || this.home;
    const target = _(room.cachedFind(FIND_STRUCTURES))
        .filter(s => s.repairs > 0 && s.structureType == structureType)
        .sample(3)
        .sortBy("repairs")
        .last();
        
    return this.actionRepair(target);
}

Creep.prototype.actionRepairNear = function() {
    const room = this.room;
    const struct = _(room.cachedFind(FIND_STRUCTURES))
        .filter(s => s.structureType != STRUCTURE_WALL && s.structureType != STRUCTURE_RAMPART && s.hits < s.hitsMax && this.pos.inRangeTo(s, 3) && !this.memory.dismantle)
        .sample();
    return this.actionRepair(struct);
}

Creep.prototype.actionRepair = function(struct) {
    if(!struct) {
        return false;
    }
    this.memory.task = {
        task: "repair",
        repair: struct.id,
        note: struct.note,
    };
    this.say(this.memory.task.note);
    return this.taskRepair();
}

Creep.prototype.taskRepair = function() {
    const structure = Game.getObjectById(this.memory.task.repair);
    if(!structure || structure.memory.dismantle) {
        return false;
    }
    if (structure.hitsMax == structure.hits) {
        return this.actionRepairNear();
    }
    if(structure.structureType == STRUCTURE_RAMPART && structure.repairs < -1) {
        return this.actionRepairNear()
    }
    // Do not do the same for rampart since the reparts are degrading and we need to repair them as much as possible.
    if(structure.structureType == STRUCTURE_WALL && structure.repairs <= 0) {
        return this.actionRepairNear();
    }
    if(!this.carry.energy) {
        return this.actionRecharge(this.carryCapacity, structure.pos);
    }
    const err = this.repair(structure);
    if(err == ERR_NOT_IN_RANGE) {
        return this.actionMoveTo(structure);
    }
    if(err == OK) {
        this.actionDoubleTime();
        return structure.hits;
    }
    console.log("repair err", err);
    return false;
}

Creep.prototype.actionEmergencyUpgrade = function() {
    const room = Game.rooms[this.memory.home] || this.room;
    if(room.controller.ticksToDowngrade < 3000){
        return actionUpgrade(creep);
    }
    return false;
}

Creep.prototype.roleWorker = function() {
    return this.idleNom() ||
        this.taskDoubleTime() ||
        this.actionTask() ||
        this.actionMineralStore() ||
        this.actionBuildStruct(STRUCTURE_TOWER) ||
        this.actionBuildStruct(STRUCTURE_EXTENSION) ||
        this.actionBuildStruct(STRUCTURE_CONTAINER) ||
        this.actionBuildFinish() ||
        this.actionRepairAny() ||
        this.actionDismantleAny() ||
        this.taskUpgrade() ||
        this.actionHarvestAny();
}

Creep.prototype.roleBootstrap = function() {
    return this.actionTask() ||
        this.actionMineralStore() ||
        this.actionPoolCharge() ||
        this.actionTowerCharge() ||
        this.actionUpgrade() ||
        this.actionHarvestAny();
}

const upkeepWalls = function(room) {
    if(room.memory.freezeWalls) {
        return;
    }
    if(!room.memory.wallMin) {
        room.memory.wallMin = 10000;
    }
    if(Game.time%100 == 0) {
        let walls = room.Structures(STRUCTURE_WALL);
        if(!walls.length) {
            return false;
        }
        const m = Math.floor(walls.length / 2);
        let s = _.sortBy(walls, "hits");
        const old = room.memory.wallMin;
        room.memory.wallMin = walls[m].hits;
        
        console.log(room.name, "wallMin:", old, "=>", room.memory.wallMin);
    }
}

const upkeepDismantle = function(room) {
    let flags = room.find(FIND_FLAGS, {filter: {name: "dismantle"}});
    let newflags = _(flags)
        .filter(f => f.color != COLOR_RED)
        .map(f => room.lookForAt(LOOK_STRUCTURES, f.pos))
        .flatten()
        .value();
    //console.log("new flags", newflags.length, JSON.stringify(newflags));

    _.each(s => {
        console.log("for munchees", JSON.stringify(s));
    });
    newflags.forEach(s => {
        console.log("new munch", s.id, "was", JSON.stringify(s.memory));
        s.dismantle();
    });
        
    flags.forEach(f => {
        if(f.color == COLOR_RED) {
            if(f.secondaryColor == COLOR_RED) {
                f.remove();
            } else {
                f.setColor(COLOR_RED, COLOR_RED);
            }
        } else {
            f.setColor(COLOR_RED, f.secondaryColor);
        }
    });
}

Creep.prototype.actionUpgrade = function() {
    this.memory.task = {
        task: "upgrade",
        note: this.pos.roomName,
    }
    return this.taskUpgrade();
}

Creep.prototype.taskUpgrade = function() {
    const controller = this.room.controller;
    if(!controller) {
        return false;
    }
    if(!this.carry.energy) {
        return this.actionRecharge(undefined, controller.pos);
    }
    const err = this.upgradeController(controller);
    if(err == ERR_NOT_IN_RANGE) {
        return this.actionMoveTo(controller);
    }
    if(err == OK) {
        this.actionDoubleTime();
    }
    return "upgrade " + controller.progress;
}


const newWorker = function(room) {
    let spawn = _.first(room.cachedFind(FIND_MY_SPAWNS));
    if(!spawn) {
        console.log("No spawners");
        return;
    }
    return spawn.roleWorker();
}

StructureSpawn.prototype.roleWorker = function() {
    let body = [
        CARRY, WORK, MOVE,
        CARRY, MOVE, WORK,
        CARRY, MOVE, WORK,
        CARRY, MOVE, WORK,
        CARRY, MOVE, WORK,
        CARRY, MOVE, WORK,
        CARRY, MOVE, WORK,
    ];
    return this.createRole(body, 3, {role: "worker"});
}


StructureSpawn.prototype.roleUpgrader = function() {
     let body = [
        CARRY, CARRY,
        WORK, MOVE,
        WORK, MOVE,
        WORK, MOVE,
        WORK, MOVE,
        WORK, MOVE,
        WORK, MOVE,
        WORK, MOVE,
        WORK, MOVE,
    ];        
    return this.createRole(body, 3, {role: "upgrader"});
}
    
Creep.prototype.roleUpgrader = function() {
    return this.taskDoubleTime() ||
        this.actionTask() ||
        this.actionUpgrade() ||
        this.actionRecharge();
}

function upkeep(room) {
    upkeepDismantle(room);
    upkeepWalls(room);
    
    return false;
}
    


module.exports = {
    upkeep: upkeep,

};