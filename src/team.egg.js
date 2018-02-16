const debug = require('debug')

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
  Memory.creeps[name] = _.defaultsDeep({}, mem, {
    team: this.name,
    egg: {
      team: this.name,
      body: role
    }
  })
  this.memory.creeps.push(name)
  return name
}

Flag.prototype.localEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'local'
    }
  }))
}

Flag.prototype.closeEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'close'
    }
  }))
}

Flag.prototype.remoteEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'remote'
    }
  }))
}

Flag.prototype.maxEgg = function (name, mem = {}) {
  return this.makeEgg(name, _.defaultsDeep({}, mem, {
    egg: {
      spawn: 'max'
    }
  }))
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

Flag.prototype.haulerEgg = function () {
  return this.localEgg('hauler', {
    egg: {energy: Math.min(2500, this.room.energyCapacityAvailable / 3)}
  })
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

Flag.prototype.rebootEgg = function () {
  return this.localEgg('reboot')
}

Flag.prototype.reserverEgg = function (mem) {
  return this.closeEgg('reserver', mem)
}

Flag.prototype.scoutEgg = function (mem) {
  return this.closeEgg('scout', mem)
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
