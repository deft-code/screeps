StructureSpawn.prototype.createRole = function(body, min, memory) {
    memory.spawn = this.name;
    memory.birth = Game.time;
    if(this.spawning) {
        this.dlog("spawning; ignored", JSON.stringify(memory));
        return ERR_BUSY;
    }
    let myParts = body;
    while(myParts.length >= min){
        const optParts = modutil.optimizeBody(myParts);
        const ret = this.createCreep(optParts, undefined, memory);
        if(_.isString(ret)) {
            console.log("Started Spawning", ret, JSON.stringify(memory));
            return ret;
        }
        if(ret != ERR_NOT_ENOUGH_ENERGY) {
            return ret;
        }
        myParts = myParts.slice(0,-1);
    }
    return ERR_NOT_ENOUGH_ENERGY;
}

module.exports = {

};