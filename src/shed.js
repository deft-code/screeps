const kThreshold = 9000;
const kThresholdCritical = 1000;
const kBucketMax = 10000;

exports.low = () => Game.cpu.getUsed() > Game.cpu.limit || Game.cpu.bucket < kThreshold;
exports.med = () => Game.cpu.getUsed() > Game.cpu.limit+100 || Game.cpu.bucket < kThreshold;
exports.hi = () => Game.cpu.getUsed() > 400 || Game.cpu.bucket < kThresholdCritical;

exports.level = 9000;
exports.check = () => {
  const level = Math.min(level, 10000);
  if(Game.cpu.bucket < level) return true;

  return Game.cpu.getUsed() > Game.cpu.limit + 400;
};

