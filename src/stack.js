exports.get = function () {
  const orig = Error.prepareStackTrace
  Error.prepareStackTrace = (error, stackArray) => { // eslint-disable-line handle-callback-err
    const end = _.findLastIndex(stackArray, f => f.getFileName() === 'main')
    if (end !== -1) {
      return stackArray.slice(0, end + 1)
    }
    // console.log('BAD STACK TRACE!', stackArray.length, stackArray);
    return stackArray
  }
  const obj = {}
  Error.captureStackTrace(obj, arguments.callee) // eslint-disable-line no-caller
  const s = obj.stack
  Error.prepareStackTrace = orig
  return s
}

exports.where = (skip = 1) => {
  const prevLimit = Error.stackTraceLimit || 10
  Error.stackTraceLimit = skip + 1
  const frames = exports.get()
  Error.stackTraceLimit = prevLimit
  const f = frames[skip]
  return `${f.getFileName()}#${f.getLineNumber()}:${f.getFunctionName()}`
}
