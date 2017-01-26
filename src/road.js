modutil = require('util');

let allRoads = {}

const getRoomRoads = r => allRoads[r.name] = allRoads[r.name] || {};

const isGood = p => !_.any(p.look(), l =>
            l.type == LOOK_CONSTRUCTION_SITES ||
            (l.type == LOOK_STRUCTURES && l.structure == STRUCTURE_ROAD));

Creep.prototype.road = function(ret) {
    if(ret == ERR_TIRED && this.room.memory.enableRoads){
        if(isGood(this.pos)) {
            let roomRoads = getRoomRoads(this.room);
            const where = JSON.stringify(_.pick(this.pos, ["x", "y"]));
            roomRoads[where] = roomRoads[where] + 1 || 1;
            console.log(modutil.who(this), "needs a road at", where, ":", roomRoads[where]);
        }
    }
    return ret;
}
     
let roadUpkeep = function(room) {
    var nsites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
    if(nsites == 0) {
        const top = head(room);
        if(top) {
            room.createConstructionSite(top, STRUCTURE_ROAD);
            console.log("New Road at", modutil.who(top));
        }
    }
    if(room.memory.roadDebug) {
        room.memory.roadDebug.roads = getRoomRoads(room);
    }
}


let head = function(room) {
    return null;
    let roomRoads = getRoomRoads(room);
    while(true) {
        let max = 0;
        let tops = [];
        _.each(roomRoads, (count, where) => {
            if(count > max) {
                max = count;
                tops = [where];
            } else if(count == max) {
                tops.push(where);
            }
        });
        //console.log("TOPS", tops);
        
        let top = _.sample(tops);
        if(!top) {
            return null;
        }
        let where = JSON.parse(top);
        /*let pos = room.getPositionAt(where.x, where.y);
        if(isGood(pos)) {
            return pos;
        }*/
        
        console.log("Road at", top.where, "no longer needed");
        delete roomRoads[top.where];
    }
}

module.exports = {
    upkeep : roadUpkeep,
};