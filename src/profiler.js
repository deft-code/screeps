
// Customize these as needed
// A v8 stack frame is defined here:
// github.com/v8/v8/wiki/Stack-Trace-API

// Returns a string from a stackframe.
const frameToString = (s) =>
  `${s.getFunctionName()}:${s.getFileName()}#${s.getLineNumber()}`;

// Returns whether a stackframe should be recorded.
const frameFilter = (s) => 
      ! s.isNative() &&
      !_.endsWith(s.getFileName(), '.js') &&
      _.isString(s.getFunctionName());

// Returns whether to record a trace
// trace is an array of stackframes.
const traceFilter = (trace) => true;

// You shouldn't need to make changes below here.

const stack = require('stack');

let gEnableTick = 0;
let gProfileRate = 0;

// Profile data is wiped when new code is pushed.
// It will also wipe when a server restarts.
let needClear = true;

exports.injectAll = () => {
  exports.injectClass(Creep.prototype);
  exports.injectClass(Room.prototype);
  PathFinder.search = exports.wrap(PathFinder.search);
  //exports.injectClass(Structure);
  //exports.injectClass(Spawn);
  //exports.injectClass(Creep);
  //exports.injectClass(Source);
  //exports.injectClass(Flag);
};

exports.injectClass = (klass) => {
  const props = Object.getOwnPropertyNames(klass);
  for (let prop of props) {
    if (prop === 'constructor') continue;
    const desc = Object.getOwnPropertyDescriptor(klass, prop);
    if(_.isFunction(desc.get)) continue;
    const f = klass[prop];
    if(!_.isFunction(f)) continue;
    klass[prop] = exports.wrap(f);
  }
};

exports.wrap = (func) => {
  return function profilerWrappedFunction() {
    const used = Game.cpu.getUsed();
    if(used > 450) {
      throw new Error(`Execution timing out ${used}`);
    }
    const ret = func.apply(this, arguments);
    exports.sample(2);
    return ret;
  }
};

const increment = (entries, count) => {
  Memory.profiler.samples += count;
  for(const entry of entries) {
    if(!Memory.profiler.profiles[entry]) {
      Memory.profiler.profiles[entry] = count;
    } else {
      Memory.profiler.profiles[entry] += count;
    }
  }
};

const update = (used) => {
  Memory.profiler.used = used;
  const delta = used - Memory.profiler.done ;
  const total = delta + Memory.profiler.acc;
  if(total > gProfileRate) {
    const count = Math.floor(total / gProfileRate);
    Memory.profiler.acc = total - (count * gProfileRate);
    Memory.profiler.done = used;
    return count;
  }
  return 0
};

// Possible trace point.
// skip is the number frames to omit from the trace.
// The default of 1 will skip the sample function.
exports.sample = (skip=1) => {
  if(Game.time !== gEnableTick) return 0;

  const count = update(Game.cpu.getUsed());
  if(count) {
    const trace = stack.get();
    if(!traceFilter(trace)) return count;

    let entries = []
    for(let i=skip; i<trace.length; i++) {
      const s = trace[i];
      if(!frameFilter(s)) continue;
      entries.push(frameToString(s));
    }
    increment(entries, count);
  }
  return count;
};

exports.main = (rate) => {
  const parseCode = Game.cpu.getUsed();
  Memory.rooms;
  const parseMem = Game.cpu.getUsed();
  //console.log(`code: ${parseCode}, mem: ${parseMem-parseCode}`);

  gProfileRate = rate || Game.cpu.limit;
  gEnableTick = Game.time;

  if(!_.isObject(Memory.profiler) || needClear) {
    console.log("PROFILER RESET");
    Memory.profiler = {
      samples: 0,
      done: 0,
      used: 0,
      acc: 0,
      profiles: {},
    };
  }
  needClear = false;

  const done = Memory.profiler.done;
  const used = Memory.profiler.used;
  let count = update(used-done);
  if(count) {
    increment(['_overflow_'], count);
  }
  Memory.profiler.done = 0;

  count = update(parseCode);
  if(count) {
    increment(['_parseCode_'], count);
  }

  count = update(parseMem);
  if(count) {
    increment(['_parseMemory_'], count);
  }
  //console.log("profiler rate", gProfileRate, JSON.stringify(Memory.profiler));
};

