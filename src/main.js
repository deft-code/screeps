const modrole = require('mod.role');
const modtower = require('tower');
const modprototypes = require('prototypes');
const modutil = require('util');
const modwork = require('work');
const modroom = require('room');
const modscout = require('role.scout');
const modmisc = require('role.misc');
const modclaim = require('squad.claim');
const modsnipe = require('squad.snipe');
const modspawn = require('spawn');
const modsquads = require('squads');
const modminer = require('squad.miner');
const modcreep = require('creep');
const modroomsquad = require('squad.room');
const modfarmsquad = require('squad.farmer');
const modcartsquad = require('squad.carts');
const modmatrix = require('matrix');

let roles = modrole.roles;

global.structMem = function(id) {
  const s = Game.getObjectById(id);
  return s.note + JSON.stringify(s.memory);
};

const time = Game.time;
const sig = Math.floor(Math.random() * 100)

module.exports.loop = function() {
  const dt = Game.time - time;
  console.log(`${Game.time}: ${sig}, ${dt}`);
  PathFinder.use(true);
  modsquads.run();

  _.each(Game.rooms, modroom.upkeep);

  _.each(Game.creeps, creep => creep.run());

  for (var name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
      console.log('Clearing non-existing creep memory:', name);
    }
  }

  for (let rname in Memory.rooms) {
    if (!Game.rooms[rname]) {
      delete Memory.rooms[rname];
      console.log('Cleaing non-existing room memory:', rname);
    }
  }
};
