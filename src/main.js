require('flag');
require('globals');
require('path');
require('room');
require('team.core');

const debug = require('debug');

let who = Game.time;
let meanBucket = Game.cpu.bucket;
let meanUsed = Game.cpu.limit;

//TODO increase this once throttling is an issue
const kMaxCPU = 300;

function shuffleRun(objs, bucket, ...funcs) {
  const maxCpu = Math.min(kMaxCPU,
    // Worst case: tends towards bucket === limit
    (Game.cpu.limit + Game.cpu.bucket)/2);

  const fs = _.shuffle(funcs);

  let cpu = Game.cpu.getUsed();
  for(const f of fs) {
    for(const obj of objs) {
      const before = cpu;
      if(before > maxCpu) break;
      if(Game.cpu.bucket < bucket - 750) break; 
      if(before > Game.cpu.limit && Game.cpu.bucket < bucket) break;
      try {
        obj[f]();
      } catch (err) {
        if(err.usedCpu > 0) {
          debug.log(obj, f, err.usedCpu);
        } else {
          debug.log(err, err.stack);
          Game.notify(err.stack, 30);
        }
      }
      cpu = Game.cpu.getUsed();
      //obj.memory.prof.cpu += Math.round(1000 * cpu - 1000 * before);
    }
  }
}

module.exports.loop = main;
function main() {
  const rooms = _.shuffle(_.values(Game.rooms));
  shuffleRun(rooms, 1000, 'runFlags');

  debug.log("Run", Game.cpu.bucket, Game.time);
  return;
  roomApply(500, 'init');

  runner(_.sample(Game.creeps, 150));
  runner(Game.flags);

  roomApply(7000, 'run');

  roomApply(8000, 'drawPlans','drawUI', 'runFlags');

  roomApply(9000, 'runPlan');
  roomApply(10000, 'growRoads');

  const used = Game.cpu.getUsed();
  meanUsed = meanUsed * 0.95 + used * 0.05;
  meanBucket = meanBucket * 0.95 + Game.cpu.bucket * 0.05;

  debug.log(`${who%10}:${Game.time-who} ${Math.round(used)}:${Math.round(meanUsed)}, ${Game.cpu.bucket}:${Math.round(meanBucket)}`);
};
