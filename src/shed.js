const debug = require('debug')

const kThreshold = 9000
const kThresholdCritical = 1000
const kMaxCPU = 350

exports.low = () => Game.cpu.getUsed() > Game.cpu.limit || Game.cpu.bucket < kThreshold
exports.med = () => Game.cpu.getUsed() > Game.cpu.limit + 100 || Game.cpu.bucket < kThreshold
exports.hi = () => Game.cpu.getUsed() > 400 || Game.cpu.bucket < kThresholdCritical

exports.level = 9000
exports.check = () => {
  const level = Math.min(exports.level, 10000)
  if (Game.cpu.bucket < level) return true

  return Game.cpu.getUsed() > Game.cpu.limit + 400
}

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
