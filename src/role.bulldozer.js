module.exports = class CreepBulldozer {

  roleBulldozer() {
    return this.idleRetreat(WORK) || this.taskTask() ||
        this.taskMoveFlag(this.team, {allowHostile:true}) ||
        this.taskDismantleAt(this.team) ||
        this.taskDismantleHostile(STRUCTURE_TOWER) ||
        this.taskDismantleHostile(STRUCTURE_SPAWN) ||
        this.taskDismantleHostiles() ||
        this.taskStompAll() ||
        this.taskRaze(STRUCTURE_CONTAINER) ||
        this.taskRaze(STRUCTURE_ROAD) ||
        this.taskDismantleHostile(STRUCTURE_RAMPART) ||
        this.taskRaze(STRUCTURE_WALL);
  }

  afterBulldozer() {
    this.idleAttack();
  }

  taskRazeWalls() {
  }

  taskRaze(...stypes) {
    return this.taskDismantle(
        this.pos.findClosestByRange(this.room.find(FIND_STRUCTURES, {
          filter: s => s.hits &&
              (!stypes.length || _.any(stypes, stype => s.structureType === stype)),
        })));
  }

  taskStompAll() {
    return this.taskStomp(this.pos.findClosestByRange(FIND_HOSTILE_CONSTRUCTION_SITES));
  }

  taskStomp(site) {
    site = this.checkId('stomp', site);
    if(!site) return false;
    return this.moveTarget(site, {range: 0, allowHostile: true, ignoreCreeps: false});
  }

  taskDismantleAt(obj) {
    const struct = _.sample(obj.pos.lookFor(LOOK_STRUCTURES));
    this.dlog('dismantling', struct);
    return this.taskDismantle(struct);
  }

  taskDismantleHostiles() {
    return this.taskDismantle(
        this.pos.findClosestByRange(this.room.find(FIND_HOSTILE_STRUCTURES, {
          filter: s => s.hits && s.structureType !== STRUCTURE_RAMPART
        })));
  }

  taskDismantleHostile(...stypes) {
    return this.taskDismantle(
        this.pos.findClosestByRange(this.room.find(FIND_HOSTILE_STRUCTURES, {
          filter: s => s.hits &&
              (!stypes.length || _.any(stypes, stype => s.structureType === stype)),
        })));
  }
};
