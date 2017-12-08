// Creates a new process that will be run by the scheduler.
// name: string module name to run
// priority: integer how aggressive this process is scheduled.
// memory: Initial memory object for process.
// Returns integer process identifier.
exports.create = (name, bucket, mem) => {
  const max = 1 + _.size(Memory.procs);
  let i = _.random(max);
  let pid;
  while(true) {
    pid = name + '_' + ((i+1)%max);
    if(exports.single(pid, bucket, mem)) {
      return pid;
    }
    i++;
  }
  throw new Error("PANIC proc.create is broken!");
};

// Ensures a named process exists. Same arguments as create.
// returns whether a process needed to be created.
exports.single = (name, bucket, mem) => {
  if(Memory.procs[name]) {
    Memory.procs[name].pri = bucket;
    return false;
  }

  Memory.procs[name] = {
    mem: mem || {},
    bucket: bucket,
    cpu95: 0,
    cpu99: 0,
  };
  return true;
};

// Returns the memory object associated with a process.
exports.memory = (pid) => {
  const proc = Memory.procs[pid];
  if(proc) {
    return proc.mem;
  }
  return null;
};

// Removes the process from the scheduler.
// pid: integer process identifier
// Returns whether a process with pid was found.
exports.remove = (pid) => {
  return delete Memory.procs[pid];
};
