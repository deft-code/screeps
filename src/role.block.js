module.exports = class CreepBlock {
  roleBlock() {
    return this.taskTask() || this.moveRoom(this.team) || this.taskBlock();
  }

  taskBlock() {
    const src = Game.getObjectById(this.team.memory.src);
    if(!src) return false;

    const what = this.moveRange(src);
    if(what) return what;

    const i = this.roleIndex();
    if(i < src.spots.length) {
      return this.moveTarget(src.spots[i]);
    }
    return false;
  }
};
