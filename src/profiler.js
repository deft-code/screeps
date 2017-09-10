// Customize these as needed
// A v8 stack frame is defined here:
// github.com/v8/v8/wiki/Stack-Trace-API

// Returns a string from a stackframe.
const frameToString = (s) =>
  `${s.getFunctionName()}:${s.getFileName()}#${s.getLineNumber()}`;

// Returns whether a stackframe should be recorded.
const frameFilter = (f) => 
      ! f.isNative() &&
      !_.endsWith(f.getFileName(), '.js') &&
      _.isString(f.getFunctionName());

const kMaxCPU = 475;

// You shouldn't need to make changes below here.

const stack = require('stack');
const murmur = require('murmur');

let gEnableTick = 0;
let gProfileRate = 0;

exports.injectAll = () => {
  PathFinder.search = exports.wrap(PathFinder.search);
  Game.map.findExit = exports.wrap(Game.map.findExit);
  Game.map.findRoute = exports.wrap(Game.map.findRoute);

  exports.injectClass(Creep.prototype);
  exports.injectClass(Flag.prototype);
  exports.injectClass(Room.prototype);
  exports.injectClass(RoomPosition.prototype);

  exports.injectClass(Structure.prototype);
  exports.injectClass(StructureLab.prototype);
  exports.injectClass(StructureLink.prototype);
  exports.injectClass(StructureNuker.prototype);
  exports.injectClass(StructureObserver.prototype);
  exports.injectClass(StructurePowerSpawn.prototype);
  exports.injectClass(StructureRampart.prototype);
  exports.injectClass(StructureSpawn.prototype);
  exports.injectClass(StructureTerminal.prototype);
  exports.injectClass(StructureTower.prototype);
};

exports.injectClass = (klass) => {
  const props = Object.getOwnPropertyNames(klass);
  for (let prop of props) {
    if (prop === 'constructor') continue;
    if (prop === 'toString') continue;
    if (prop === 'toJSON') continue;
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
    if(used > kMaxCPU) {
      const e = new Error(`${this} Execution timing out ${used}`);
      e.usedCpu = used;
      throw e;
    }
    const ret = func.apply(this, arguments);
    exports.sample(2);
    return ret;
  }
};

const increment = (newEntry) => {
  Memory.profiler.samples += newEntry.count;

  let entry = Memory.profiler.traces[newEntry.hash];
  if(!entry) {
    //console.log("profile", JSON.stringify(newEntry));
    Memory.profiler.traces[newEntry.hash] = newEntry;
    delete newEntry.hash;
  } else {
    entry.count += newEntry.count;
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

// Create a trace point.
// A will occassionally originate from this call.
// Manually add these to busy loops that do not create intents.
//
// skip is the number frames to omit from the trace.
//  The default of 1 will skip the sample function.
exports.sample = (skip=1) => {
  if(Game.time !== gEnableTick) return 0;

  const count = update(Game.cpu.getUsed());
  if(count) {
    const l = Error.stackTraceLimit;
    Error.stackTraceLimit = 20;
    const trace = stack.get();
    Error.stackTraceLimit = l;

    let nu = {
      funcs: [],
      files: [],
      lines: [],
      hash: 0,
      count: count,
    };
    for(let i=skip; i<trace.length; i++) {
      const f = trace[i];
      if(!frameFilter(f)) continue;
      const func = f.getFunctionName();
      const file = f.getFileName();
      const line = f.getLineNumber();

      nu.funcs.push(func);
      nu.files.push(file);
      nu.lines.push(line);

      nu.hash = murmur.hash(func,
        murmur.hash(file, nu.hash+line));
    }
    increment(nu);
  }
  return count;
};

// CALL THIS FIRST!
// This function finishes up the accounting from the previous tick.
// It also profies code parse time and memory parst time. These are only
// possible if this method is called first each tick.
exports.main = (rate) => {
  const parseCode = Game.cpu.getUsed();
  Memory.rooms;
  const parseMem = Game.cpu.getUsed();
  //console.log(`code: ${parseCode}, mem: ${parseMem-parseCode}`);

  gProfileRate = rate || Game.cpu.limit - 11;
  gEnableTick = Game.time;

  if(!_.isObject(Memory.profiler)) {
    exports.reset();
  }

  const done = Memory.profiler.done;
  const used = Memory.profiler.used;
  let count = update(used-done);
  if(count) {
    console.log('OVERFLOW', count);
    increment({
      files: ['_postmain_'],
      lines: [1],
      funcs: ['_overflow_'],
      count: count,
      hash: 1,
    });
  }
  Memory.profiler.done = 0;

  count = update(parseCode);
  if(count) {
    console.log('PARSE', count);
    increment({
      files: ['_premain_'],
      lines: [1],
      funcs: ['_parseCode_'],
      count: count,
      hash: 2,
    });
  }

  count = update(parseMem);
  if(count) {
    console.log('MEMORY', count);
    increment({
      files: ['main'],
      lines: [1],
      funcs: ['_parseMemory_'],
      count: count,
      hash: 3,
    });
  }
  //console.log("profiler rate", gProfileRate, JSON.stringify(Memory.profiler));
};

exports.reset = () => {
  Memory.profiler = {
    samples: 0,
    done: 0,
    used: 0,
    acc: 0,
    traces: {},
  };
};
