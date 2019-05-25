import * as debug from 'debug';

const kMaxCPU = 350
const kMinBucket = 50;

const minBucket = 500 - Game.cpu.limit;

export function canRun(cpu: number, bucket: number) {
    if (cpu > kMaxCPU) {
        debug.warn('Max CPU Throttled')
        return false
    }
    if (Game.cpu.bucket < minBucket) {
        debug.warn("Bucket Throttled:", `${Game.cpu.bucket} < ${minBucket}`);
        return false;
    }

    const delta = Game.cpu.limit - Game.cpu.getUsed();
    const dbucket = Game.cpu.bucket + delta;

    if (dbucket < bucket) {
        debug.warn("CPU Throttled:", `${Game.cpu.getUsed()}:${Game.cpu.bucket}`);
        return false;
    }
    return true;
}

export function run<T>(objs: T[], bucket: number, func: (t: T) => void) {
    if (!canRun(Game.cpu.getUsed(), bucket)) return

    let order = _.shuffle(objs)
    for (const obj of order) {
        if (!canRun(Game.cpu.getUsed(), bucket)) {
            debug.warn('CPU Throttled!', obj, func)
            return
        }
        try {
            func(obj);
        } catch (err) {
            debug.log(obj, func, err, err.stack)
            Game.notify(err.stack, 30)
        }
    }
}
