exports.get = function() {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (error, stack_array) => {
    const end = _.findLastIndex(stack_array, f => f.getFileName() === 'main');
    if(end !== -1) {
      return stack_array.slice(0, end+1);
    }
    console.log('BAD STACK TRACE!', stack_array.length, stack_array);
    return stack_array;
  };
  const obj = {};
  Error.captureStackTrace(obj, arguments.callee);
  const s = obj.stack;
  Error.prepareStackTrace = orig;
  return s;
};

exports.where = (skip = 1) => {
  const frames = exports.get();
  const f = frames[skip];
  return `${f.getFileName()}#${f.getLineNumber()}`;
};
