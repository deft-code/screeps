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
      const frames = stack.get();
      const f = frames[1];
      const role = this.memory.role || '';
      console.log(`${f.getFileName()}:${f.getLineNumber()}`, this, role, ...str);
    }
  }
}

exports.log = (...o) => {
  const frames = stack.get();
  const f = frames[1];
  console.log(`${f.getFileName()}:${f.getLineNumber()}`, ...o);
};

lib.merge(Flag, Debuggable);
lib.merge(Creep, Debuggable);
