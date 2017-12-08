const debug = require('debug');

Flag.prototype.teamCore = function() {
}

function reboot(flag) {
  const n = flag.room.find(FIND_MY_CREEPS).length;
  if(n) return false;

  return flag.replaceRole('reboot', 1);
}
