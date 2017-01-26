var modrole = require('mod.role');
var modtower = require('tower');
var modprototypes = require('prototypes');
var modutil = require('util');
var modwork = require('work');
let modroom = require('room');
let modpump = require('role.pump');
let modscout = require('role.scout');
const modmisc = require("role.misc");
const modclaim = require("squad.claim");
const modsnipe = require("squad.snipe");
const modspawn = require("spawn");
const modsquads = require("squads");
const modminer = require("squad.miner");
const modcreep = require("creep");
const modroomsquad = require("squad.room");
const modfarmsquad = require("squad.farmer");
const modcartsquad = require("squad.carts");

let roles = modrole.roles;
//roles.pump = modpump.rolePump;

global.structMem = function(id) {
    const s = Game.getObjectById(id);
    return s.note + JSON.stringify(s.memory);
}

const time = Game.time;
const sig = Math.floor( Math.random() * 100)

module.exports.loop = function() {
    const dt = Game.time - time;
    console.log(`${Game.time}: ${sig}, ${dt}`);
    PathFinder.use(true);
    modsquads.run();
  
    _.each(Game.rooms, modroom.upkeep);

    _.each(Game.creeps, creep => creep.run());
    
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }
    
    for(let rname in Memory.rooms) {
        if(!Game.rooms[rname]) {
            delete Memory.rooms[rname];
            console.log("Cleaing non-existing room memory:", rname);
        }
    }
}