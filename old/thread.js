// RealTime Scheduler
// Processes are executed in strict priority order. Bucket limit determines priority (lower buckets first).
// A process will not run if `Game.cpu.bucket` is less than a process's bucket.
// Processes at priority > kBucketFull will only run if cpu is under limit.
// A process that returns `false` will be removed.

// When the bucket is below this value no batch processes will run.
const kBucketFull = 9000

const kMaxCPU = 450

// Runs the scheduler and executes as may processes as possible before reaching CPU limit.
exports.run = () => {
  if (!Memory.rtos) {
    Memory.rtos = {
      procs: {}
    }
  }

  const maxCpu = Math.min(kMaxCPU,
    // Worst case: tends towards bucket === limit
    (Game.cpu.limit + Game.cpu.bucket) / 2)

  const pids = _.sortBy(
    _.shuffle(_.keys(Memory.rtos.procs)),
    pid => Memory.rtos.procs[pid].bucket)
  console.log('PIDs', pids)

  let runs = 0
  for (const pid of pids) {
    const cpu = Game.cpu.getUsed()
    if (cpu > maxCpu) break
    const proc = Memory.rtos.procs[pid]
    if (!proc) continue
    if (proc.bucket >= kBucketFull && cpu > Game.cpu.limit) break
    if (Game.cpu.bucket < proc.bucket) break
    runs++
    const mod = _.first(_.words(pid))
    const f = _.attempt(require, `proc.${mod}`)
    if (!_.isFunction(f)) {
      console.log(`Process Failed ${f}: ${pid}, ${JSON.stringify(proc)}`)
      exports.remove(pid)
      continue
    }
    proc.cpu = Math.floor(1000 * (Game.cpu.getUsed() - cpu))
    proc.cpu95 = Math.round(proc.cpu95 * 0.95 + proc.cpu * 0.05)
    proc.cpu99 = Math.round(proc.cpu99 * 0.99 + proc.cpu * 0.01)
    const ret = _.attempt(f, proc.mem, pid)
    if (ret === 'done') {
      exports.remove(pid)
    }
  }
  return runs
}

// Creates a new process that will be run by the scheduler.
// name: string module name to run
// priority: integer how aggressive this process is scheduled.
// memory: Initial memory object for process.
// Returns integer process identifier.
exports.create = (name, bucket, mem) => {
  const max = 1 + _.size(Memory.rtos.procs)
  let i = _.random(max)
  let pid
  while (true) {
    pid = name + '_' + ((i + 1) % max)
    if (!Memory.rtos.procs[pid]) break
    i++
  }

  Memory.rtos.procs[pid] = {
    bucket: bucket,
    mem: mem || {},
    cpu: 0,
    cpu95: 0,
    cpu99: 0
  }
  return pid
}

exports.single = (name, bucket, mem) => {
}

// Returns the memory object associated with a process.
exports.memory = (pid) => {
  const proc = Memory.rtos.procs[pid]
  if (proc) {
    return proc.mem
  }
  return null
}

// Removes the process from the scheduler.
// pid: integer process identifier
// Returns whether a process with pid was found.
exports.remove = (pid) => {
  return delete Memory.rtos.procs[pid]
}
