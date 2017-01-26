/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('role.scout');
 * mod.thing == 'a thing'; // true
 */


Creep.prototype.roleScout = function() {
    if(this.hits < this.hitsMax) {
        this.moveTo(Game.spawns.Home);
        return "flee";
    }
    var f = Game.flags.Scout;
    if(f && !this.pos.isNearTo(f)){
        this.moveTo(f);
        return 'move to flag';
    }
    return false;
}

Creep.prototype.roleDistraction = function() {
    if(this.memory.duck || !Game.flags.distraction){
        const dirs = [TOP, BOTTOM];
        this.move(_.sample(dirs));
        return "hold position";
    }
    if(this.pos.isEqualTo(Game.flags.distraction)) {
        this.memory.duck = true;
        return "in place";
    }
    this.moveTo(Game.flags.distraction);
}

StructureSpawn.prototype.newDistraction = function() {
    const body = [
        TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE,
        TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE, TOUGH, MOVE,
    ];
    return this.createCreep(
        [MOVE],
        undefined,
        {role: "distraction"});
}

module.exports = {

};