exports.get = function() {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (error, stack_array) => {
    const end = _.findIndex(stack_array, f => f.getFileName() === '__mainLoop');
    if(end !== -1) {
      return stack_array.slice(0, end+1);
    }
    console.log('BAD STACK TRACE!');
    return stack_array;
  };
  const obj = {};
  Error.captureStackTrace(obj, arguments.callee);
  const s = obj.stack;
  Error.prepareStackTrace = orig;
  return s;
};
