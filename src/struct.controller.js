const util = require('util');

util.roProp(StructureController, 'resTicks', function() {
  const res = this.reservation;
  if(!res) return 0;
  return res.ticksToEnd;
});
