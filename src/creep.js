const modutil = require('util');

modutil.cachedProp(Creep, 'home', function() {
  return Game.rooms[this.memory.home] || this.squad.home || this.room;
});

modutil.cachedProp(Creep, 'squad', function() {
  return Game.squads[this.memory.squad];
});

modutil.cachedProp(Creep, 'team', function() {
  return Game.flags[this.memory.team];
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

//modutil.roProp(Creep, 'hurts', function() {
//  return this.hitsMax - this.hits;
//});

//modutil.cachedProp(Creep, 'carryTotal', function() {
//  return _.sum(this.carry);
//});

//modutil.cachedProp(Creep, 'carryFree', function() {
//  return this.carryCapacity - this.carryTotal;
//});

modutil.cachedProp(Creep, 'partsByType', creep =>
    _(creep.body)
        .filter(part => part.hits)
        .countBy("type")
        .value());

modutil.cachedProp(Creep, 'ignoreRoads', creep => creep.body.length >= 2*creep.getActiveBodyparts(MOVE));
modutil.cachedProp(Creep, 'hostile',
    creep => creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK));
    
modutil.cachedProp(Creep, 'assault',
    creep => creep.hostile || creep.getActiveBodyparts(WORK) || creep.getActiveBodyparts(CLAIM) >= 5);
