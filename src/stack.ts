// Stack frames up to the `main` module (2017), the ancestor of debug.ts's
// where/location. Orphan: nothing imports it.

// V8's prepareStackTrace/captureStackTrace/stackTraceLimit are not in the
// lib typings; debug.ts takes the same way out.
declare var Error: any;

// V8 call-site frames as prepareStackTrace sees them.
interface CallSite {
  getFileName(): string
  getLineNumber(): number
  getFunctionName(): string
}

export function get (): CallSite[] {
  const orig = Error.prepareStackTrace
  Error.prepareStackTrace = (_error: any, stackArray: CallSite[]) => {
    const end = _.findLastIndex(stackArray, f => f.getFileName() === 'main')
    if (end !== -1) {
      return stackArray.slice(0, end + 1)
    }
    // console.log('BAD STACK TRACE!', stackArray.length, stackArray);
    return stackArray
  }
  const obj: { stack?: CallSite[] } = {}
  // (The JS passed arguments.callee, which strict mode forbids.)
  Error.captureStackTrace(obj, get)
  const s = obj.stack!
  Error.prepareStackTrace = orig
  return s
}

export function where (skip = 1): string {
  const prevLimit = Error.stackTraceLimit || 10
  Error.stackTraceLimit = skip + 1
  const frames = get()
  Error.stackTraceLimit = prevLimit
  const f = frames[skip]
  return `${f.getFileName()}#${f.getLineNumber()}:${f.getFunctionName()}`
}
