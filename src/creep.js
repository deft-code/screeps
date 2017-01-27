const modutil = require('util');

modutil.cachedProp(Creep, 'home', function() {
  return Game.rooms[this.memory.home] || this.squad.home || this.room;
});

modutil.cachedProp(Creep, 'squad', function() {
  return Game.squads[this.memory.squad];
});

modutil.roProp(Creep, 'taskId', function() {
  const task = this.memory.task || {};
  return Game.getObjectById(task.id);
});

modutil.roProp(Creep, 'taskFlag', function() {
  const task = this.memory.task || {};
  return Game.flags[task.flag];
});

modutil.roProp(Creep, 'taskCreep', function() {
  const task = this.memory.task || {};
  return Game.creeps[task.creep];
});
