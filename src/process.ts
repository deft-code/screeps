import * as debug from "debug";

export type Priority = "critical" | "normal" | "low" | "extra";

function typeName(cmd: string): string {
    return cmd.split(" ")[0];
}

function cmdArgs(cmd: string): string[] {
    return cmd.split(" ").slice(1);
}

export class Process {
    name: string;
    constructor(name: string) {
        this.name = name;
    }

    get args(): string[] {
        return cmdArgs(this.name);
    }

    run(): Priority {
        return "low";
    }
}
const registry = new Map<string, typeof Process>();
const ptab = new Map<string, Process>();

export function register(klass: typeof Process) {
    const name: string = klass.prototype.constructor.name;
    if (registry.has(name)) {
        console.log("Double Registry!!!");
        return;
    }
    registry.set(name, klass);
}

declare global {
    interface Memory {
        scheduler: {
            critical: string[];
        }
    }
}

export function spawn(cmd: string): Process | null {
    if (ptab.has(cmd)) {
        console.log("Duplicate process!!!", cmd);
        return null;
    }
    const klassName = typeName(cmd);
    const klass = registry.get(klassName);
    if (!klass) {
        console.log("Invalid process Type", klassName, "from", cmd);
        return null;
    }

    const proc = new klass(cmd);
    ptab.set(cmd, proc);
    //Memory.scheduler.critical.push(cmd);
    Memory.scheduler.critical = [cmd];
    return proc;
}

export function runAll() {
    for (let pname of Memory.scheduler.critical) {
        const proc = ptab.get(pname) || spawn(pname);
        proc?.run();
    }
}