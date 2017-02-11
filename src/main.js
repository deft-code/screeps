require('traveler')({exportTraveler: false, installTraveler: true, installPrototype: true, defaultStuckValue: 2});

const modutil = require('util');
const server = require('server');
const team = require('team');
const teambase = require('team.base');
const teamclaim = require('team.claim');

const lib = require('lib');
lib.enhanceAll();

const modprototypes = require('prototypes');

require('container');
require('controller');
require('link');
require('matrix');
require('room');
require('source');
require('spawn');
require('tower');

const modcreep = require('creep');
require('creep.move');
require('role.hauler');

const modrole = require('mod.role');
const modwork = require('work');
const modsnipe = require('squad.snipe');

const modguard = require('role.guard');
const modattack = require('squad.attack');
const modscout = require('role.scout');
const modchemist = require('role.chemist');
const modsrcer = require('role.srcer');
const medic = require('role.medic');
const modcartsquad = require('squad.carts');
const modclaim = require('squad.claim');
const modfarmsquad = require('squad.farmer');
const modmisc = require('role.misc');
const modrobsquad = require('squad.rob');
const modroomsquad = require('squad.room');
const modsquads = require('squads');

global.structMem = function(id) {
  const s = Game.getObjectById(id);
  return s.note + JSON.stringify(s.memory);
};

global.dismantle = (id) => Game.getObjectById(id).dismantle();

global.opposite = lib.oppositeDir;

if(false) {
    const profiler = require('screeps-profiler');
    profiler.enable();
    module.exports.loop = profiler.wrap(main);
} else {
    module.exports.loop = main;
}

function runner(objs) {
  for(let name in objs) {
    obj = objs[name];
    try {
      obj.run();
    }
    catch( err ) {
      console.log(err.stack);
      Game.notify(err.stack, 30);
    }
  }
}

function main() {
    PathFinder.use(true);
    runner(Game.rooms);
    runner(Game.flags);
    runner(Game.spawns);
    modsquads.run();
    runner(Game.creeps);

    for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
           delete Memory.creeps[name];
          console.log('Clearing non-existing creep memory:', name);
        }
    }
    //console.log(server.run(), server.ticks, server.uptime);
}
