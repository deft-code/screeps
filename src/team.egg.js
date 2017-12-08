const debug = require('debug');

let lastI = 0;
function findName(role) {
  let n = Game.ncreeps;
  if(!n) n = _.size(Memory.creeps);

  const nn = n + 1;

  for(let i=0; i<nn; i++) {
    const ii = i+lastI % nn;
    const name = role + ii;
    if(!Memory.creeps[name]) {
      lastI = i;
      return name;
    }
  }
  debug.log("Failed to find creep name", role, n);
  return role + Game.time;
}

Flag.prototype.makeEgg = function(role, mem) {
  const name = findName(role);
  Memory.creeps[name] = _.defaultsDeep(mem, {
    team: this.name,
    egg: {
      team: this.name,
      body: role,
    }
  });
  this.memory.creeps.push(name);
  return name;
}

Flag.prototype.localEgg = function(name, mem={}) {
  return this.makeEgg(name, _.defaultsDeep(mem, {
    egg: {
      spawn: 'local'
    }
  }));
}

Flag.prototype.rebootEgg = function() {
  return this.localEgg('reboot');
}

Flag.prototype.auxsrcEgg = function() {
  return this.localEgg('auxsrc', {egg: {body: 'coresrc'}});
}

Flag.prototype.coresrcEgg = function() {
  return this.localEgg('coresrc');
}

Flag.prototype.haulerEgg = function() {
  return this.localEgg('hauler', {
    egg: {energy: Math.min(2500, this.room.energyCapacityAvailable/3)},
  });
}

Flag.prototype.workerEgg = function() {
  return this.localEgg('worker');
}

Flag.prototype.coreEgg = function() {
  return this.localEgg('core', {egg: {body: 'shunt'}});
}

Flag.prototype.auxEgg = function() {
  return this.localEgg('aux', {egg: {body: 'shunt'}});
}
