let modutil = require("util");

modutil.cachedProp(Structure, 'storeTotal', function() {
    return _.sum(this.store);
});

modutil.cachedProp(Structure, 'storeFree', function() {
    return this.storeCapacity - this.storeTotal;
});

modutil.cachedProp(Structure, "note", function() {
    return modutil.structNote(this.structureType, this.pos);
});

Structure.prototype.dismantle = function() {
    this.memory.dismantle = true;
    this.notifyWhenAttacked(false);
    return this.note + JSON.stringify(this.memory);
}

modutil.cachedProp(Source, "note", function() {
    return modutil.structNote("src", this.pos);
});

Object.defineProperty(RoomObject.prototype, 'memory', {
    get: function() {
        if(_.isUndefined(this.room.memory.objects)) {
            this.room.memory.objects = {};
        }
        if(!_.isObject(this.room.memory.objects)) {
            return undefined;
        }
        return this.room.memory.objects[this.id] = this.room.memory.objects[this.id] || {};
    },
    set: function(value) {
        if(_.isUndefined(this.room.memory.objects)) {
            this.room.memory.objects = {};
        }
        if(!_.isObject(this.room.memory.objects)) {
            throw new Error('Could not set source memory');
        }
        this.room.memory.objects[this.id] = value;
    }
});



function dlog(...args) {
    if(this.memory.debug || (Memory.dlog && _.matches(Memory.dlog)(this))) {
        console.log(`${Game.time%100}:`, modutil.who(this), ...args);
    }
}

Creep.prototype.dlog = dlog;
Room.prototype.dlog = dlog;
Structure.prototype.dlog = dlog;

Object.defineProperty(StructureContainer.prototype, 'charger', {
    get: function() {
        if(_.isUndefined(this.memory.source)) {
            let srcs = this.pos.findInRange(FIND_SOURCES, 1);
            let mines = this.pos.findInRange(FIND_MINERALS, 1);
            this.memory.source = srcs.length > 0 || mines.length > 0;
        }
        return this.memory.source;
    }
});

Object.defineProperty(StructureContainer.prototype, 'source', {
    get: function() {
        if(_.isUndefined(this.memory.source)) {
            let srcs = this.pos.findInRange(FIND_SOURCES, 1);
            let mines = this.pos.findInRange(FIND_MINERALS, 1);
            this.memory.source = srcs.length > 0 || mines.length > 0;
        }
        return this.memory.source;
    }
});

Object.defineProperty(StructureLink.prototype, 'source', {
    get: function() {
        if(_.isUndefined(this.memory.source)) {
            let srcs = this.pos.findInRange(FIND_SOURCES, 2);
            this.memory.source = srcs.length > 0;
        }
        return this.memory.source;
    }
});

Object.defineProperty(Structure.prototype, 'repairs', {
    get: function() {
        // TODO memory was undefined!
        if(false && this.memory.dismantle) {
            return -1;
        }
        let myMax = this.hitsMax;
        switch(this.structureType){
            case STRUCTURE_RAMPART:
            case STRUCTURE_WALL:
                myMax = Math.min(this.hitsMax, this.room.memory.wallMin * 0.8);
                break;
            case STRUCTURE_ROAD:
                myMax = this.hitsMax / 5;
                break;
        }
        myMax = Math.max(this.memory.hitsMax || 0, myMax);
        return 1 - (this.hits / myMax);
    }
});