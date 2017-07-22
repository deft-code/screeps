const lib = require('lib');
const stack = require('stack');

class Debuggable {
  get debug() {
    if(Game.time < this.memory.debug) {
      return true;
    }
    delete this.memory.debug;
    return false;
  }

  set debug(value) {
    if(!value) {
      delete this.memory.debug;
    }
    if(value === true) {
      value = 500;
    }
    if(_.isFinite(value)) {
      this.memory.debug = Game.time + value;
    }
  }

  dlog(...str) {
    if(this.debug) {
      console.log(stack.where(2), who(this), ...str);
    }
  }

  warn(...str) {
    warn(this.name, stack.where(2), who(this), ...str);
  }

  log(...str) {
    console.log(stack.where(2), who(this), ...str);
  }
}

const who = (obj) => obj.memory.role? `${obj} ${obj.memory.role}`: `${obj}`;

exports.log = (...o) => {
  console.log(stack.where(2), ...o);
};

const warn = (key, ...o) => {
  const warned = Game.warned = Game.warned || {};
  if(!warned[key]) {
    warned[key] = true;
    console.log(...o);
  }
};

exports.warn = (...o) => {
  const prefix = stack.where(2);
  warn(prefix, prefix, ...o);
};

lib.merge(Flag, Debuggable);
lib.merge(Creep, Debuggable);
