import * as debug from 'debug';

export interface MemoryTask {
    task: string
    args: (number | string)[]
}

export interface TaskMemory {
    task?: MemoryTask
}

interface Taskable {
    name: string
    role: string
    id?: string
    log(...args: any[]): void
    memory: TaskMemory
}

export interface Targetable {
    id: string
}

interface TaskRun {
    [taskName: string]: (target: string) => TaskRet
}

export type TaskRet = false | // task failed, (run Role)
    'done' | // task completed, stop
    'role' | // task abandonned, run role
    'again' | // task proceeding, run task again
    string; // task proceeding, stop

export function dynamicRole(c: any, prefix: string): unknown {
    const role = c.role;
    const fname = _.camelCase(prefix + ' ' + role);
    return dynamicRun(c, fname);
}

function dynamicRun(c: any, fname: string, args: any[] = []): 'nothing' | unknown {
    const fn = c[fname];
    if (_.isFunction(fn)) return fn.apply(c, args);
    return 'nothing';
}

export class Tasker {
    tick = 0;
    name = '';
    repeats = 0;
    maxRepeats = 2;
    cpu = 0;
    maxCpu = 5;

    location(n: number): string {
        return debug.where(n).func;
    }

    taskNull(c: Taskable, n = 4, ...args: (string | number)[]): string {
        const task = this.location(n)
        c.memory.task = {
            task,
            args,
        }
        return task
    }

    task<T extends Targetable>(c: Taskable, n: number, target: T | string | null | undefined, ...args: (string | number)[]): (T | null) {
        if (_.isString(target)) {
            target = Game.getObjectById<T>(target);
        }
        if (!target) return null;
        const task = this.location(n);
        if (!(task in c)) return null;
        c.memory.task = {
            task,
            args: [target.id, ...args],
        };
        return target;
    }

    // Whether to attempt to repeat a task.
    // Also a good place to run task independent code.
    preloop(c: Taskable): boolean {
        const ret = dynamicRole(c, 'pre')
        if (ret === 'nothing') return true;
        return ret as boolean;
    }

    // Perform the main logic loop.
    // Tasker may call this multiple times during a tick.
    loop(c: Taskable): TaskRet {
        const ret = dynamicRole(c, 'role')
        if (ret === 'nothing') return false;
        return ret as TaskRet;
    }

    loopable(c: Taskable): boolean {
        if (this.name !== c.name || this.tick !== Game.time) {
            this.name = c.name;
            this.repeats = 0;
            this.tick = Game.time;
            this.cpu = Game.cpu.getUsed();
            return true;
        }

        this.repeats++;
        return this.repeats < this.maxRepeats &&
            (Game.cpu.getUsed() - this.cpu) < this.maxCpu;
    }

    doTask(c: Taskable): TaskRet {
        const info = c.memory.task;
        if (!info || !_.isObject(info)) return 'role';
        const args = info.args;
        let ret;
        try {
            ret = dynamicRun(c, info.task, args);
        } catch (err) {
            this.clean(c);
            throw err;
        }
        if (ret === 'nothing') {
            c.log("Bad task!", JSON.stringify(info));
            return 'role';
        }
        return ret as TaskRet;
    }

    looper(c: Taskable) {
        while (this.loopable(c)) {
            if (!this.preloop(c)) {
                this.clean(c);
            }
            let what = this.doTask(c);
            // console.log("tasker ret", c, what);
            if (!what || what === 'role' || what === 'done') {
                this.clean(c);
            }
            if (!what || what === 'role') {
                what = this.loop(c);
            }
            if (what === 'again') {
                continue;
            }
            break;
        }
    }

    clean(c: Taskable) {
        delete c.memory.task;
    }
}