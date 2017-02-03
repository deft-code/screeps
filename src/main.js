const modutil = require('util');
const server = require('server');
const team = require('team');
const lib = require('lib');

const modprototypes = require('prototypes');
const modcontroller = require('controller');
const modcreep = require('creep');
const modroom = require('room');
const modtower = require('tower');
const modspawn = require('spawn');
const modmatrix = require('matrix');

const modrole = require('mod.role');
const modwork = require('work');
const modsnipe = require('squad.snipe');

const modguard = require('role.guard');
const modattack = require('squad.attack');
const modscout = require('role.scout');
const modchemist = require('role.chemist');
const modsrcer = require('role.srcer');
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

if(false) {
    const profiler = require('screeps-profiler');
    profiler.enable();
    module.exports.loop = profiler.wrap(main);
} else {
    module.exports.loop = main;
}

function main() {
    PathFinder.use(true);
    _.each(Game.flags, flag => flag.run());

    modsquads.run();

    _.each(Game.rooms, modroom.upkeep);

    _.each(Game.creeps, creep => creep.run());

     for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
           delete Memory.creeps[name];
          console.log('Clearing non-existing creep memory:', name);
        }
    }
    //console.log(server.run(), server.ticks, server.uptime);
}