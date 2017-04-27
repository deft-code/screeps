let gEnableTick = 0;
let gProfileRate = 0;
let gDoneCpu = 0;

// Profile data is wiped when new code is pushed.
// It will also wipe when a server restarts.
let needClear = true;

exports.injectAll = () => {
  exports.injectClass(Creep);
  exports.injectClass(Game);
  exports.injectClass(Room);
  exports.injectClass(Structure);
  exports.injectClass(Spawn);
  exports.injectClass(Creep);
  exports.injectClass(RoomPosition);
  exports.injectClass(Source);
  exports.injectClass(Flag);
};

exports.injectClass = (klass) => {
};

exports.wrap = (func) => {
  return function wrappedFunction() {
    const ret = func.apply(this, arguments);
    exports.sample();
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

const update = () => {
  const used = Game.cpu.getUsed();
  Memory.profiler.acc = used - gDoneCpu;

  const total = Memory.profiler.acc + Memory.profiler.extra;
  let count = 0;
  if(total > gProfileRate) {
    count = Math.floor(Memory.profiler.acc / gProfileRate);
    Memory.profiler.extra = total - (count * gProfileRate);
    gDoneCpu = used;
  }
  return count;
};

exports.main = (rate) => {
  if(!_.isObject(Memory.profiler) || needClear) {
    Memory.profiler = {
      samples: 0,
      acc: 0,
      extra: 0,
      profiles: {},
    };
  }
  needClear = false;

  gDoneCpu = 0;
  gEnableTick = Game.time;
  gProfileRate = rate;
  Memory.profiler.extra += Memory.profiler.acc

  const count = update();
  if(count) increment(['Memory'], count);
}

exports.sample = () => {
  if(Game.time !== enableTick) return 0;

  const count = update();
  if(count) {
    const ss = stack();
    let entries = []
    for(let i=1; i<ss.length; i++) {
      const s = ss[i];
      if(s.isNative()) break;
      const entry = `${s.getFunctionName()}:${s.getFileName()}:${s.getLineNumber}`;
      entries.push(entry);
    }
    increment(entries, count);
  }
  return count;
}
