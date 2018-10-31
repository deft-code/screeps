const debug = require('debug')

const kMaxCPU = 350

function canRun (cpu, bucket) {
  if (cpu > kMaxCPU) {
    debug.warn('CPU Throttled')
    return false
  }
  if (Game.cpu.bucket < bucket - 750) return false
  if (cpu > Game.cpu.limit && Game.cpu.bucket < bucket) return false
  return true
}

function run (objs, bucket, ...funcs) {
  if (!canRun(Game.cpu.getUsed(), bucket)) return

  let runs = []
  for (const f of funcs) {
    runs.push(..._.map(objs, obj => [obj, f]))
  }
  runs = _.shuffle(runs)
  for (const [obj, f] of runs) {
    if (!canRun(Game.cpu.getUsed(), bucket)) break
    try {
      obj[f]()
    } catch (err) {
      debug.log(obj, f, err, err.stack)
      Game.notify(err.stack, 30)
    }
  }
}

module.exports = {
  canRun,
  run
}
