import * as debug from 'debug';

let lastI = 0
function findName (role) {
  let n = Game.ncreeps
  if (!n) n = _.size(Memory.creeps)

  const nn = n + 1

  for (let i = 0; i < nn; i++) {
    const ii = i + lastI % nn
    const name = role + ii
    if (!Memory.creeps[name]) {
      lastI = i
      return name
    }
  }
  debug.log('Failed to find creep name', role, n)
  return role + Game.time
}

Flag.prototype.makeEgg = function (role, mem) {
  const name = findName(role)
  const over = this.memory.over || {}
  Memory.creeps[name] = _.defaultsDeep({egg: {}}, over, mem, {
    team: this.name,
    egg: {
      team: this.name,
      body: role,
      laid: Game.time,
    }
  })
  this.memory.creeps.push(name)
  return name
}

Flag.prototype.localEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'local',
      priority: 5
    }
  }))
}

Flag.prototype.closeEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'close',
      priority: 15
    }
  }))
}

Flag.prototype.remoteEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'remote',
      priority: 10
    }
  }))
}

Flag.prototype.maxEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'max',
      priority: 9
    }
  }))
}

Flag.prototype.asrcEgg = function(mem) {
  return this.localEgg('asrc', _.defaultsDeep({}, mem, {egg: {body: 'srcer'}}));
}

Flag.prototype.auxEgg = function () {
  return this.localEgg('aux', {egg: {body: 'shunt'}})
}

Flag.prototype.auxsrcEgg = function () {
  return this.localEgg('auxsrc', {egg: {body: 'coresrc'}})
}

Flag.prototype.bootstrapEgg = function () {
  return this.remoteEgg('bootstrap')
}

Flag.prototype.bsrcEgg = function(mem) {
  return this.localEgg('bsrc', _.defaultsDeep({}, mem, {egg: {body: 'srcer'}}));
}

Flag.prototype.bulldozerEgg = function () {
  return this.closeEgg('bulldozer')
}

Flag.prototype.cartEgg = function (mem) {
  return this.closeEgg('cart', mem)
}

Flag.prototype.chemistEgg = function () {
  return this.localEgg('chemist')
}

Flag.prototype.claimerEgg = function () {
  return this.closeEgg('claimer')
}

Flag.prototype.cleanerEgg = function () {
  return this.closeEgg('cleaner')
}

Flag.prototype.collectorEgg = function () {
  return this.closeEgg('collector')
}

Flag.prototype.coresrcEgg = function () {
  return this.localEgg('coresrc')
}

Flag.prototype.coreEgg = function () {
  return this.localEgg('core', {egg: {body: 'shunt'}})
}

Flag.prototype.ctrlEgg = function (mem) {
  return this.localEgg('ctrl', mem)
}

Flag.prototype.declaimerEgg = function (mem) {
  return this.maxEgg('declaimer', mem)
}

Flag.prototype.defenderEgg = function (mem) {
  return this.localEgg('defender', mem)
}

Flag.prototype.farmerEgg = function (mem) {
  return this.closeEgg('farmer', mem)
}

Flag.prototype.guardEgg = function (mem) {
  return this.closeEgg('guard', mem)
}

Flag.prototype.harvestagaEgg = function () {
  return this.closeEgg('harvestaga', {
    egg: {body: 'miner'}})
}

Flag.prototype.harvesterEgg = function () {
  return this.closeEgg('harvester', {
    egg: {body: 'miner'}})
}

Flag.prototype.haulerEgg = function (mem) {
  return this.localEgg('hauler', _.defaultsDeep(
    {}, mem, {
    egg: {energy: Math.min(2500, this.room.energyCapacityAvailable / 2)}
  }));
}

Flag.prototype.hubEgg = function () {
  return this.localEgg('hub', {
    egg: {body: 'hub'}});
}

Flag.prototype.masonEgg = function() {
  this.localEgg('mason', {
    boosts: [
      RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
      RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
      RESOURCE_CATALYZED_KEANIUM_ACID]
  });
}

Flag.prototype.microEgg = function (mem) {
  return this.closeEgg('micro', mem)
}

Flag.prototype.minecartEgg = function (mem) {
  return this.localEgg('minecart', mem)
}

Flag.prototype.minerEgg = function (mem) {
  return this.closeEgg('miner', mem)
}

Flag.prototype.mineralEgg = function (mem) {
  return this.localEgg('mineral', mem)
}

Flag.prototype.miniEgg = function (mem) {
  return this.closeEgg('mini', {
    egg: {body: 'mini'}})
}

Flag.prototype.paverEgg = function () {
  return this.closeEgg('paver', {
    egg: {body: 'worker'}})
}

Flag.prototype.ramboEgg = function (mem) {
  return this.maxEgg('rambo', {
    boosts: [
      RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
      RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
      RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
      RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]
  })
}

Flag.prototype.rebootEgg = function () {
  return this.localEgg('reboot')
}

Flag.prototype.reserverEgg = function (mem) {
  return this.closeEgg('reserver', mem)
}

Flag.prototype.scoutEgg = function (mem) {
  return this.closeEgg('scout', mem)
}

Flag.prototype.startupEgg = function () {
  return this.localEgg('startup')
}

Flag.prototype.towerEgg = function () {
  return this.remoteEgg('tower')
}

Flag.prototype.truckagaEgg = function (mem) {
  return this.closeEgg('truckaga', {
    egg: {body: 'collector'}})
}

Flag.prototype.truckerEgg = function (mem) {
  return this.closeEgg('trucker', {
    egg: {body: 'collector'}})
}

Flag.prototype.upgraderEgg = function () {
  return this.localEgg('upgrader', {
    egg: {body: 'worker'}})
}

Flag.prototype.wolfEgg = function () {
  return this.closeEgg('wolf')
}

Flag.prototype.workerEgg = function () {
  return this.localEgg('worker')
}

Flag.prototype.zombiefarmerEgg = function () {
  return this.closeEgg('zombiefarmer', {
    egg: {body: 'collector'}})
}
