import * as debug from "debug";

export type Priority = "critical" | "normal" | "low" | "late" | "extra" | "kill";

function typeName(cmd: string): string {
    return cmdArgs(cmd)[0];
}

function cmdArgs(cmd: string): string[] {
    return cmd.split(" ");
}

export interface IProcess {
    bucket: number
    run(): Priority
    kill(): void
}

export class Process {
    constructor(readonly bucket: number = 9000) { }
    run(): Priority { return "low" }
    kill() { }
}

declare global {
    interface Memory {
        scheduler: {
            services: string[]
            next: number
        }
    }
}


const services = new Map<string, Service>();

export class Service extends Process {
    constructor(readonly name: string, readonly bucket: number = 9000) {
        super(bucket);
    }

    get args(): string[] {
        return cmdArgs(this.name);
    }

    run(): Priority {
        return "low";
    }

    kill() {
        services.delete(this.name);
        _.remove(Memory.scheduler.services, s => s === this.name);
    }

    static getType<T extends Service>(cmd: string): T | null {
        return services.get(cmd) as unknown as T || null;
    }

    static schedule(cmd: string): Service | null {
        const proc = this.spawn(cmd);
        if (proc) {
            Memory.scheduler.services.push(cmd);
        }
        return proc;
    }
    static spawn(cmd: string): Service | null {
        const klassName = typeName(cmd);
        const klass = getOrImport(klassName);
        if (!klass) {
            debug.log("Invalid process Type", klassName, "from", cmd, "procs: ", registry.keys());
            return null;
        }

        const proc = new klass(cmd);
        services.set(cmd, proc);
        const priority = Game.cpu.bucket > 1000 ? "normal" : "low";
        table[priority].push(proc);
        return proc
    }

    static boot() {
        for (let serviceName of Memory.scheduler.services) {
            Service.spawn(serviceName);
        }
    }
}

const registry = new Map<string, typeof Service>();

function getOrImport(klassName: string): typeof Service | undefined {
    const klass = registry.get(klassName);
    if (klass) return klass;

    const importName = `ms.${klassName}`;
    debug.log(`Process klass'${klassName}' not registered, attempting import@'${importName}'`);
    require(importName);
    return registry.get(klassName);
}

export function register(klass: typeof Service) {
    register_inner(klass);
}

function register_inner(klass: typeof Service) {
    const name: string = klass.prototype.constructor.name;
    if (registry.has(name)) {
        debug.log("Double Registry!!!");
        return name;
    }
    registry.set(name, klass);
    return name;
}


export function daemon(klass: typeof Process) {
    const priority = Game.cpu.bucket > 1000 ? "normal" : "low";
    debug.log("Daemon called for", klass.name, "@", priority);
    exec(new klass(), priority);
}

export function exec(proc: IProcess, priority: Priority = "low") {
    table[priority].push(proc);
}

const table = {
    critical: [] as IProcess[],
    normal: [] as IProcess[],
    low: [] as IProcess[],
    late: [] as IProcess[],
    extra: [] as IProcess[],
    kill: [] as IProcess[],
}

function runRow(priority: Priority, minBucket: number) {
    const row = table[priority];
    table[priority] = [];
    const deferred = [];
    let first = true;
    for (const proc of row) {
        if (first || canRun(Math.max(minBucket, proc.bucket))) {
            first = false;
            try {
                const next = proc.run();
                table[next].push(proc);
            } catch (err) {
                debug.log(proc, err, (err as { stack: string }).stack);
                Game.notify((err as { stack: string }).stack, 30);
                deferred.push(proc);
            }
        } else {
            deferred.push(proc);
        }
    }
    table[priority] = _.shuffle(deferred).concat(_.shuffle(table[priority]));
}

export function runAll() {
    runRow("critical", 50);
    runRow("normal", Game.cpu.limit + 50);
    runRow("low", 2000);
    runRow("late", 1000);
    const next = Memory.scheduler.next || Game.time;
    if (next <= Game.time) {
        Memory.scheduler.next = Game.time + _.random(200);
        runRow("extra", 9000);
    }
}

export function canRun(bucket: number, up = 0) {
    const cpu = Game.cpu.getUsed();
    const maxCpu = Math.min(Game.cpu.bucket + Game.cpu.limit / 2, 450);
    if (cpu > maxCpu) {
        debug.warn(`Max CPU Throttled ${Math.ceil(cpu)} > ${maxCpu} @`, debug.location(up + 2))
        return false
    }

    const delta = Game.cpu.limit - Game.cpu.getUsed();
    const dbucket = Game.cpu.bucket + delta;

    if (dbucket > bucket) return true;

    const lottery = Math.random() / 2 + 0.5;
    if (lottery < dbucket / bucket) {
        const loc = debug.location(up + 2);
        debug.warn("Bucket Throttled:", `${Math.round(cpu)}+${Game.cpu.bucket}<${bucket} @ ${loc}`);
        return false;
    }
    return true;
}