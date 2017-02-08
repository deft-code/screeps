const lib = require('lib');

const spots = new Map();

const caclSpots = (src) => {
  console.log(`Calculating spots for src ${src.pos}`); 
  return _(src.room.lookForAtArea(LOOK_TERRAIN, src.pos.x-1, src.pos.y-1, src.pos.x+1, src.pos.y+1, true))
    .filter(spot => spot.terrain !== 'wall')
    .map(spot => new RoomPosition(spot.x, spot.y, src.roomName))
    .value('');
};

lib.enhance(Source, 'spots', (src) => {
  const key = JSON.stringify(src.pos);
  if(!spots[key]) {
    spots[key] = calcSpots(src);
  }
  return spots[key];
});
