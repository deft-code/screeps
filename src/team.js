const debug = require('debug');
const spawn = require('spawn');

Flag.prototype.runTeam = function() {
  const gone = gc(this);
  if(gone.length) {
    debug.log("Cleaned up", gone);
  }

  switch(this.secondaryColor) {
    case COLOR_BLUE: return this.teamCore();
  }
  this.remove();
  debug.log(this, "Missing team");
}

function gc(flag) {
  flag.memory.creeps = flag.memory.creeps || [];
  for(let cname of flag.memory.creeps) {
    if(!Memory.creeps[cname]) {
      return _.remove(flag.memory.creeps, c => c === cname);
    }
    if(!Game.creeps[cname] && !Memory.creeps[cname].egg) {
      delete Memory.creeps[cname];
      return _.remove(flag.memory.creeps, c => c === cname);
    }
  }
  return [];
}

Flag.prototype.replaceRole = function(role, want, mem) {
  const have = this.countRole(role);
  if(have>=want) return false;
  const fname = `${role}Egg`;
  return this[fname](mem)
}

Flag.prototype.ensureRole = function(role, want, mem) {
  const have = this.countRole(role);
  if(have>want) return false;
  const fname = `${role}Egg`;
  if(have<want) return this[fname](mem);

  let ttl = 1500;
  let stime = 150;
  const creeps = this.roleCreeps(role);
  for(const c of creeps) {
    ttl = Math.min(c.ticksToLive, ttl);
    stime = Math.max(c.spawnTime, stime);
  }
}

Flag.prototype.countRole = function(role) {
  return this.countByRole()[role] || 0;
}

Flag.prototype.countByRole = function() {
  if(this._countByRole) return this._countByRole;

  return this._countByRole = _.countBy(this.memory.creeps,
    n => _.first(_.words(n)));
}

Flag.prototype.teamCore = function() {
  return reboot(this) ||
    coresrc(this) ||
    auxsrc(this) ||
    hauler(this) ||
    shunts(this) ||
    worker(this) ||
    controller(this) ||
    false;
}

function controller(flag) {
  let cap = flag.room.energyAvailable;

  if(flag.room.storage) {
    if(flag.room.storage.store.energy < kEnergyReserve) {
      cap = kRCL2Energy;
    }
  }
  return flag.replaceRole('ctrl', 1, {egg:{ecap: cap}});
}

function hauler(flag) {
  const storage = flag.room.storage;
  let nhauler = 1;
  if(!storage) {
    nhauler++;
  }
  return flag.replaceRole('hauler', nhauler);
}

function auxsrc(flag) {
  return flag.replaceRole('auxsrc', 1);
}

function coresrc(flag) {
  return flag.replaceRole('coresrc', 1);
}

function reboot(flag) {
  const creeps = flag.room.find(FIND_MY_CREEPS);
  if(_.some(creeps, c => c.role === 'hauler')) return false;

  return flag.replaceRole('reboot', 1);
}

function worker(flag) {
  let n = 0;
  if(flag.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
    n++;
  } else if(flag.room.storage && flag.room.storage.my && flag.room.storage.store.energy > 500000) {
    n++;
  }
  return flag.replaceRole('worker', n);
}

function shunts(flag) {
  const rcl = flag.room.controller.level;

  let ncore = 0;
  let naux = 0;
  if(flag.room.storage && flag.room.storage.my) {
    ncore = 1;
  }

  if(flag.room.terminal && flag.room.terminal.my) {
    naux = 1;
  }

  return flag.replaceRole('core', ncore) ||
    flag.replaceRole('aux', naux);
}
