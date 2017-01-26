/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('settings');
 * mod.thing == 'a thing'; // true
 */

const defaults = {};
defaults.energy_priority = {};
defaults.energy_priority[STRUCTURE_SPAWN] = 3;
defaults.energy_priority[STRUCTURE_EXTENSION] = 3;
defaults.energy_priority[STRUCTURE_TOWER] = 3;
defaults.energy_priority[STRUCTURE_LAB] = 2;
defaults.energy_priority[STRUCTURE_LINK] = 2;
defaults.energy_priority[STRUCTURE_TERMINAL] = 2;
defaults.energy_priority[STRUCTURE_CONTAINER] = 2;
defaults.energy_priority[STRUCTURE_STORAGE] = 1;

module.exports = {

};