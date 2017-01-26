
function sprint(...args) {
    let sargs = args.map(a => who(a));
    return sargs.join(" ");
}

function errString(err) {
    switch(err) {
        case OK:
            return "OK";
        case ERR_NOT_IN_RANGE:
            return "ERR_NOT_IN_RANGE";
        case ERR_BUSY:
            return "ERR_BUSY";
        case ERR_INVALID_TARGET:
            return "ERR_INVALID_TARGET";
    }
    return "err" + err;
}

function structNote(type, pos) {
    switch(type) {
        case STRUCTURE_WALL:
            type = "wall";
            break;
        case STRUCTURE_EXTENSION:
            type = "extn";
            break;
        case STRUCTURE_STORAGE:
            type = "store";
            break;
        case STRUCTURE_TERMINAL:
            type = "term";
            break;
        case STRUCTURE_CONTAINER:
            type = "contnr";
            break;
    }
    
    const xy = "" + pos.x + pos.y;
    return type.slice(0, 10-xy.length) + xy;
}

function optimizeBody(body) {
    return body.slice().sort((l, r) => {
        if(l==r) {
            return 0;
        }
        if(l == TOUGH) {
            return -1;
        }
        if(r == TOUGH) {
            return 1;
        }
        if(l == CARRY) {
            return -1;
        }
        if(r == CARRY) {
            return 1;
        }
        if(l == MOVE) {
            return 1;
        }
        if(r == MOVE) {
            return -1;
        }
        return 0;
    });
}

let who = function(obj) {
    let parts;
    if(obj instanceof RoomPosition) {
        parts = [obj.x, obj.y];
    } else if(obj instanceof Creep){
        const task = obj.memory.task || {};
        parts = [obj.name, obj.memory.role, task.task, task.note];
    } else if(obj instanceof Resource) {
        parts = [obj.resourceType, who(obj.pos)];
    } else if(obj instanceof Source) {
        parts = ["src", who(obj.pos)];
    } else if(obj instanceof Structure) {
        parts = [obj.structureType, obj.name, who(obj.pos)];
    } else if(obj instanceof ConstructionSite) {
        parts = ["site", who(obj.pos)];
    } else if(obj instanceof Room) {
        parts = [obj.name];
    } else if(obj == null) {
        parts = ["null"];
    } else if(typeof obj == "number") {
        parts = [errString(obj)];
    } else if(obj.id) {
        parts = [obj.id.slice(-4)];
    } else {
        parts = [String(obj)];
    }
    return "(" + _.compact(parts).join() + ")";
}

function cachedProp(klass, prop, func) {
    Object.defineProperty(klass.prototype, prop, {
        get: function() {
            this.cache = this.cache || {}
            return this.cache[prop] = this.cache[prop] || func.apply(this);
        },
    });
}

function roProp(klass, prop, func) {
    Object.defineProperty(klass.prototype, prop, { get: func});
}

function randomResource(resources) {
    let r = {};
    Object.assign(r, resources);
    if(r.energy == 0) {
        delete r.energy;
    }
    return _.sample(Object.keys(r));
}

module.exports = {
    who: who,
    cachedProp: cachedProp,
    roProp: roProp,
    sprint: sprint,
    randomResource: randomResource,
    structNote: structNote,
    optimizeBody: optimizeBody,
};