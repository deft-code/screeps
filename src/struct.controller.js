const lib = require('lib');

lib.cachedProp(StructureController, 'resTicks', function() {
  const res = this.reservation;
  if(!res) return 0;
  return res.ticksToEnd;
});

lib.cachedProp(StructureController, 'reservable', ctrl =>
  !ctrl.owner && (!ctrl.reservation || ctrl.reservation.username === 'deft-code'));
