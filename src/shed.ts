import * as debug from 'debug';

const kMaxCPU = 300; // 350
const kMinBucket = 50;

const minBucket = 500 - Game.cpu.limit;

export function canRun(cpu: number, bucket: number, up = 0) {
    if (cpu > kMaxCPU) {
        debug.warn(`Max CPU Throttled ${Math.ceil(cpu)} > ${kMaxCPU} @`, debug.location(up + 2))
        return false
    }
    if (Game.cpu.bucket < minBucket) {
        debug.warn("Bucket Throttled:", `${Game.cpu.bucket} < ${minBucket} @`, debug.location(up + 2));
        return false;
    }

    const delta = Game.cpu.limit - Game.cpu.getUsed();
    const dbucket = Game.cpu.bucket + delta;

    if (dbucket < bucket) {
        const loc = debug.location(up + 2);
        debug.warn("CPU Throttled:", `${Math.round(Game.cpu.getUsed())}:${Game.cpu.bucket}<${bucket} @ ${loc}`);
        return false;
    }
    return true;
}

export function run<T>(objs: T[], bucket: number, func: (t: T) => void) {
    const start = Game.cpu.getUsed();
    let now = start;
    if (!canRun(now, bucket, 1)) return

    let worstName = "";
    let worstCpu = -1;
    let n = 0;

    let order = _.shuffle(objs);
    for (const obj of order) {
        try {
            func(obj);
        } catch (err) {
            debug.log(obj, func, err, (err as {stack:string}).stack);
            Game.notify((err as {stack:string}).stack, 30);
        }
        n++;
        const prior = now;
        now = Game.cpu.getUsed();
        const d = now - prior;
        if (d > worstCpu) {
            worstName = "" + obj;
            worstCpu = d;
        }
        if (!canRun(now, bucket, 1)) {
            debug.warn('CPU Throttled!', obj, func);
            break;
        }
    }
    const avg = (now - start) / n;
    if (worstCpu > 1 && (worstCpu > avg || worstCpu > 10)) {
        //debug.log(Math.round(start), "CpuHog:", worstCpu.toFixed(1), `avg(${n}):`, avg.toFixed(1), func, worstName);
    }
}
