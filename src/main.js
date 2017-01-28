const modutil = require('util');

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

const modscout = require('role.scout');
const modcartsquad = require('squad.carts');
const modclaim = require('squad.claim');
const modfarmsquad = require('squad.farmer');
const modminer = require('squad.miner');
const modmisc = require('role.misc');
const modrobsquad = require('squad.rob');
const modroomsquad = require('squad.room');
const modsquads = require('squads');

global.structMem = function(id) {
  const s = Game.getObjectById(id);
  return s.note + JSON.stringify(s.memory);
};

const time = Game.time;
const sig = Math.floor(Math.random() * 100)

const profiler = require('screeps-profiler');

//profiler.enable();
module.exports.loop = function() {
     profiler.wrap(function() {
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
    });
}


