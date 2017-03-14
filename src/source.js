const lib = require('lib');

const spots = new Map();

const calcSpots = (obj) => {
  //console.log(`Calculating spots for obj ${obj.pos}`);
  return _(obj.room.lookForAtArea(
               LOOK_TERRAIN, obj.pos.y - 1, obj.pos.x - 1, obj.pos.y + 1,
               obj.pos.x + 1, true))
      .filter(spot => spot.terrain !== 'wall')
      .map(spot => new RoomPosition(spot.x, spot.y, obj.pos.roomName))
      .value('');
};

const getSpots = (obj) => {
  const key = JSON.stringify(obj.pos);
  if (!spots[key]) {
    spots[key] = Object.freeze(calcSpots(obj));
  }
  return spots[key];
};

lib.enhance(Mineral, 'spots', getSpots);
lib.enhance(Source, 'spots', getSpots);

lib.enhance(Source, 'note', (src) => `src${src.pos.x}${src.pos.y}`);
lib.enhance(Mineral, 'note', (src) => `minral${src.pos.x}${src.pos.y}`);
