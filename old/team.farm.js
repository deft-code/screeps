const debug = require('debug')

Flag.prototype.teamFarm = function () {
  debug.log('New farm')
  return 'farm'
}

Flag.prototype.teamReserve = function () {
  if (this.memory.occupy === true || this.memory.occupy > Game.time) {
    if (this.room && this.room.claimable) {
      return this.upkeepRole(1, {role: 'claimer', body: 'claim'}, 4, this.closeSpawn(650))
    }
    return
  }

  let canReserve = false
  if (this.room) {
    const nsrcs = this.room.find(FIND_SOURCES).length
    const controller = this.room.controller
    const claimed = controller && controller.owner && !controller.my
    this.dlog(this.room, 'claimed', claimed)
    let wantReserve = this.memory.reserve
    if (wantReserve === undefined) {
      wantReserve = this.minSpawnDist() < 5 || nsrcs > 1
    }
    canReserve = !this.room.memory.thostiles && controller && !claimed &&
        controller.resTicks < 4000 && wantReserve
  }

  this.dlog(`${this.room} reservable: ${canReserve}`)

  return canReserve && this.upkeepRole(3, {role: 'reserver', body: 'reserve'}, 2, this.closeSpawn(1300))
}

Creep.prototype.taskRoadUpkeep = function () {
  if (!this.carry.energy) return false

  this.dlog('roadUpkeep')

  return this.taskRepairRoads() || this.taskBuildStructs(STRUCTURE_ROAD) ||
      this.taskBuildAny()
}

Flag.prototype.teamHarvest = function () {
  let nminer = 1
  let ncart = 1
  let cartMax = 50
  let nfarmer = 0
  if (this.room) {
    if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length) {
      nfarmer = 1
    }

    const srcs = this.room.find(FIND_SOURCES)
    nminer = srcs.length
    ncart = nminer
  }
  return this.upkeepRole(nminer, {role: 'miner', body: 'miner'}, 2, this.closeSpawn(550)) ||
    this.upkeepRole(ncart, {role: 'cart', body: 'cart', max: cartMax}, 3, this.closeSpawn(550)) ||
    this.upkeepRole(nfarmer, {role: 'farmer', body: 'farmer'}, 2, this.closeSpawn(800))
}

Flag.prototype.teamSuppress = function (e = 0) {
  if (!this.room) {
    return this.upkeepRole(1, {role: 'scout', body: 'scout'}, 4, this.closeSpawn(300))
  }
  const t = this.room.memory.thostiles
  const nguard = Math.ceil(t / 300)
  const nwolf = Math.floor(t / 300)
  this.dlog(`attacked ${t}: guard ${nguard}, wolf ${nwolf}`)
  return this.upkeepRole(nwolf, {role: 'wolf', body: 'attack'}, 3, this.closeSpawn(e + 570)) ||
    this.upkeepRole(nguard, {role: 'guard', body: 'guard'}, 3, this.closeSpawn(e + 190))
}
