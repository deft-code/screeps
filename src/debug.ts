import * as lib from 'lib';

declare var Error: any;

interface Pos {
  line: number;
  file: string;
  func: string;
}

export function errlog(err: ScreepsReturnCode, ...str: any[]): ScreepsReturnCode {
  if (err !== OK) {
    console.log(location(2), errStr(err), ...str);
  }
  return err;
}

export function where(skip = 1): Pos {
  const prevLimit = Error['stackTraceLimit'];
  Error.stackTraceLimit = skip + 1;
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (e: any, stackArray: any) => {
    const f = stackArray[skip];
    return {
      file: f.getFileName(),
      line: f.getLineNumber(),
      func: f.getFunctionName()
    };
  };
  const obj: any = {};
  Error.captureStackTrace(obj);
  const loc = obj.stack;
  Error.prepareStackTrace = orig;
  Error.stackTraceLimit = prevLimit;
  return loc;
}

export function location(skip = 1) {
  const pos = where(skip + 1);
  return `${pos.file}:${pos.line}#${pos.func}`;
}

export function log(...str: any[]) {
  console.log(location(2), ...str);
}

let warnTime = Game.time;
let warned = new Set<string>();
export function warn(...str: any[]) {
  if (warnTime !== Game.time) {
    warned.clear();
    warnTime = Game.time;
  }

  const loc = location(2);
  if (warned.has(loc)) return;

  warned.add(loc);
  console.log(loc, ...str);
}

export function errStr(err: ScreepsReturnCode) {
  switch (err) {
    case OK: return 'OK';
    case -OK: return 'OK';
    case ERR_BUSY: return 'ERR_BUSY';
    case ERR_FULL: return 'ERR_FULL';
    case ERR_INVALID_ARGS: return 'ERR_INVALID_ARGS';
    case ERR_INVALID_TARGET: return 'ERR_INVALID_TARGET';
    case ERR_NOT_ENOUGH_RESOURCES: return 'ERR_NOT_ENOUGH_RESOURCES';
    case ERR_NOT_IN_RANGE: return 'ERR_NOT_IN_RANGE';
    case ERR_TIRED: return 'ERR_TIRED'
    case ERR_NOT_ENOUGH_ENERGY: return 'ERR_NEED_ENERGY';
    case ERR_NOT_ENOUGH_EXTENSIONS: return 'ERR_NEED_EXTENSIONS';
    case ERR_NOT_ENOUGH_RESOURCES: return 'ERR_NOT_ENOUGH_RESOURCES';
    default: return 'ERR' + -err
  }
}

export function dirStr(dir: DirectionConstant) {
  switch (dir) {
    case LEFT: return 'W'
    case TOP_LEFT: return 'NW'
    case TOP: return 'N'
    case TOP_RIGHT: return 'NE'
    case RIGHT: return 'E'
    case BOTTOM_RIGHT: return 'SE'
    case BOTTOM: return 'S'
    case BOTTOM_LEFT: return 'SW'
  }
  return 'none'
}

interface DebugMemory {
  debug?: number
}

export class Debuggable {
  memory: DebugMemory
  name: string

  get debug() {
    if (this.memory.debug && Game.time < this.memory.debug) {
      return true
    }
    delete this.memory.debug
    return false
  }

  set debug(value: boolean | number) {
    if (!value) {
      delete this.memory.debug
      return
    }

    if (value === true) {
      value = 500
    }
    if (_.isFinite(value)) {
      this.memory.debug = Game.time + value
    }
  }

  dlog(...str: any[]) {
    if (this.debug) {
      console.log(location(2), this, ...str)
    }
  }

  warn(...str: any[]) {
    warn(this.name, location(2), this, ...str)
  }

  log(...str: any[]) {
    console.log(location(2), this, ...str)
  }

  errlog(err: ScreepsReturnCode, ...str: any[]): ScreepsReturnCode {
    if (err !== OK) {
      console.log(location(2), this, errStr(err), JSON.stringify(err), ...str);
    }
    return err;
  }
}

lib.merge(Flag, Debuggable)
lib.merge(Creep, Debuggable)
lib.merge(Room, Debuggable)
