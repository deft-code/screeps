const debug = require('debug');

Room.prototype.runFlags = function() {
  const flags = _.shuffle(this.find(FIND_FLAGS));
  for(const flag of flags) {
    try {
      flag.run();
    } catch(err) {
      debug.log(err, err.stack);
    }
  }
};
