module.exports = class CreepBoost {
  taskBoostOne() {
    if(!_.size(this.memory.boosts)) return false;
    const mineral = this.memory.boosts.pop();
    const what =  this.taskBoostMineral(mineral);
    if(!what) {
      console.log(`ERROR: ${this} unable to boost ${mineral}`);
    }
    return what;
  }

  taskBoostMineral(mineral) {
    const lab = _.find(this.room.findStructs(STRUCTURE_LAB),
      lab => lab.mineralType === mineral && lab.mineralAmount > 30);
    return this.taskBoost(lab);
  }

  taskBoost(lab) {
    lab = this.checkId('boost', lab);
    if(!lab) return false;
    if(lab.mineralAmount < 30) return false;

    const err = lab.boostCreep(this);
    if(err === ERR_NOT_IN_RANGE) {
      return this.moveNear(lab);
    }
    if(err !== OK) {
      console.log(`UNEXPECTED boost error: ${err}, ${this}, ${lab}`);
      return false;
    }
    return 'success';
  }
};
