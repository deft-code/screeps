
function balance(more, less) {

}

StructureLink.prototype.balance = function(other) {
    if(this.energy - other.energy < 200) {
        return false;
    }
    
    const delta = Math.floor((this.energy - other.energy) / 2);
    const extra = delta % 100;
    const amount = delta - extra;
    let err = this.transferEnergy(other, amount);
    return err == OK && modutil.sprint("tranferred", amount, "to", other);
}

function upkeepBucket(bucket, links) {
    if(bucket.cooldown) {
        return;
    }
    if(bucket.energy < 100) {
        return;
    }
    for(let i in links) {
        let link = links[i];
        let need = link.energyCapacity - link.energy;
        if(link.energy >= bucket.energy || need < 100) {
            continue;
        }
        let xfer = Math.min(bucket.energy, need);
        let xtra = xfer % 100;
        let amount = xfer - xtra;
        let err = bucket.transferEnergy(link, amount);
        bucket.dlog("xfer", err, amount, link);
        return;
    }
}
    
function upkeep(room) {
    let links = room.Structures(STRUCTURE_LINK).slice();
    if(links.length < 2) {
        return;
    }
    let buckets = _.remove(links, l => l.memory.bucket);
    for(let i in buckets) {
        let bucket = buckets[i];
        upkeepBucket(bucket, links);
    }
}


    
module.exports = {
    upkeep: upkeep,

};