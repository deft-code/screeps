exports.get = function() {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (error, stack_array) => stack_array;
  const obj = {};
  Error.captureStackTrace(obj, arguments.callee);
  const s = obj.stack;
  Error.prepareStackTrace = orig;
  return s;
};
