module.exports = class CreepRam {
  roleRam() {
    return this.idleRetreat(TOUGH) || this.taskTask() ||
        this.taskMoveFlag(this.team, {allowHostile:true}) ||
        this.taskDismantleAt(this.team) ||
        this.taskDismantleHostile(STRUCTURE_TOWER) ||
        this.taskDismantleHostile(STRUCTURE_SPAWN) ||
        this.taskDismantleHostile(STRUCTURE_EXTENSION, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_LAB) ||
        this.taskRaze(STRUCTURE_CONTAINER) ||
        this.taskDismantleHostile() ||
        this.taskStompAll() ||
        //this.taskRaze(STRUCTURE_ROAD) ||
        this.taskRaze(STRUCTURE_WALL) ||
        this.taskRaze(STRUCTURE_ROAD);
  }
};
