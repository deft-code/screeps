import * as debug from 'debug';

Room.prototype.keeper = function () {
  if (!this._keeper) {
    this._keeper = new RoomKeeper(this)
  }
  return this._keeper
}

export function runKeeper(room) {
  if (!room.controller) return
  if (!room.controller.my) return

  const k = room.keeper()
  k.run()
}

class RoomKeeper {
  constructor (room) {
    this.room = room
    this.room.memory.keeper = this.room.memory.keeper || {}
  }

  planOne (stype, x, y) {
    return this.plan(stype, this.room.packPos(this.room.getPositionAt(x, y)))
  }

  plan (stype, ...xys) {
    const plans = this.getPlans(stype)
    this.memory.plans[stype] = _.unique(plans.concat(xys))
  }

  get memory () {
    return this.room.memory.keeper
  }

  getPlans (stype) {
    const plans = this.memory.plans = this.memory.plans || {}
    const splans = plans[stype]
    if (!splans) {
      plans[stype] = []
      return plans[stype]
    }
    return splans
  }

  sync () {
    this.room.findStructs()
    const stypes = _.keys(this.room.structsByType)
    for (const stype of stypes) {
      this.memory.plans[stype] = _.map(this.room.structsByType[stype], s => s.xy)
    }
  }

  draw () {
    const stypes = _.keys(this.memory.plans)
    for (const stype of stypes) {
      const xys = this.memory.plans[stype]
      for (const xy of xys) {
        const p = this.room.unpackPos(xy)
        this.room.visual.circle(p.x, p.y, {radius: 0.5, fill: 'cornflowerblue'})
      }
    }
  }

  run () {
    this.room.dlog(this.room.energyFreeAvailable)
    if (this.room.energyFreeAvailable > 0) return false

    const gnc = _.size(Game.constructionSites)
    if (gnc > 50) return
    this.room.dlog(gnc)

    const nc = this.room.find(FIND_MY_CONSTRUCTION_SITES).length
    if (nc > 2) return
    this.room.dlog(nc)

    const ns = this.room.find(FIND_STRUCTURES).length

    this.rcl = (this.room.controller && this.room.controller.my && this.room.controller.level) || 0

    this.room.dlog(ns, this.memory.lastStructs)
    this.room.dlog(this.rcl, this.memory.rcl)
    if ((Game.time - this.memory.last > 1500) &&
      this.memory.lastStructs === ns &&
      this.memory.rcl === this.rcl) {
    }

    this.memory.last = Game.time

    const ret = this.runPlans()

    if (!ret) {
      // debug.log('completed all plans');
      this.memory.lastStructs = ns
      this.memory.rcl = this.rcl
      this.runShields()
    } else {
      this.room.log('placed ctor', ret)
    }
  }

  runShields () {
    const all = this.room.findStructs(
      STRUCTURE_LINK,
      STRUCTURE_NUKER,
      STRUCTURE_SPAWN,
      STRUCTURE_STORAGE,
      STRUCTURE_TERMINAL,
      STRUCTURE_TOWER
    )
    const xys = _.map(all,
      s => this.room.packPos(s.pos))
    return this.plan(STRUCTURE_RAMPART, ...xys)
  }

  runPlans () {
    this.ignore = _(this.room.find(FIND_FLAGS))
      .filter(f => f.color === COLOR_ORANGE && f.secondaryColor === COLOR_RED)
      .map(f => f.what())
      .value()
    return this.runPlan(STRUCTURE_TOWER) ||
      this.runPlan(STRUCTURE_SPAWN) ||
      this.runPlan(STRUCTURE_TERMINAL) ||
      this.runPlan(STRUCTURE_STORAGE) ||
      this.runPlan(STRUCTURE_EXTENSION) ||
      this.runPlan(STRUCTURE_WALL) ||
      this.runPlan(STRUCTURE_RAMPART) ||
      this.runPlan(STRUCTURE_LINK) ||
      // this.runPlan(STRUCTURE_CONTAINER) ||
      this.runExtractor() ||
      this.runRoads() ||
      this.runPlan(STRUCTURE_LAB) ||
      this.runPlan(STRUCTURE_OBSERVER) ||
      this.runPlan(STRUCTURE_NUKER) ||
      // TODO enable this when power is useful.
      (false && this.runPlan(STRUCTURE_POWER_SPAWN)) ||
      false
  }

  runExtractor () {
    if (!this.room.terminal) return false

    const mineral = _.first(this.room.find(FIND_MINERALS))
    return this.tryBuild(STRUCTURE_EXTRACTOR, this.room.packPos(mineral.pos))
  }

  runRoads () {
    // TODO be smarter about which roads to build when.
    const ntowers = this.room.findStructs(STRUCTURE_TOWER)
    if (ntowers < 1) return false
    return this.runPlan(STRUCTURE_ROAD)
  }

  runPlan (stype) {
    if (_.contains(this.ignore, stype)) return false

    const needs = CONTROLLER_STRUCTURES[stype][this.rcl]
    const structs = this.room.findStructs(stype)
    if (structs.length >= needs) return false

    const sites = _.filter(this.room.find(FIND_MY_CONSTRUCTION_SITES), site => site.structureType === stype)

    const total = structs.length + sites.length
    if (total >= needs) return false

    const plans = this.getPlans(stype)
    if (total === plans.length) return false
    if (total > plans.length) {
      debug.log('found new', stype)
      const xys = _.map(structs.concat(sites), s => this.room.packPos(s.pos))
      this.plan(stype, ...xys)
      return false
    }

    return this.build(stype)
  }

  build (stype) {
    const plans = this.getPlans(stype)
    for (let xy of plans) {
      const built = this.tryBuild(stype, xy)
      if (built) return built
    }
    return false
  }

  tryBuild (stype, xy) {
    const p = this.room.unpackPos(xy)
    const structs = p.lookFor(LOOK_STRUCTURES)
    for (let struct of structs) {
      if (struct.structureType === stype) return false

      if (stype !== STRUCTURE_RAMPART &&
        struct.structureType !== STRUCTURE_ROAD &&
        struct.structureType !== STRUCTURE_RAMPART) {
        debug.log(stype, 'Blocked by', struct, 'at', p)
        if (stype === STRUCTURE_ROAD) {
          debug.log('before remove', this.memory.plans[stype].length)
          _.remove(this.memory.plans[stype], p => p === xy)
          debug.log('after remove', this.memory.plans[stype].length)
          return `removed:${stype}`
        }
        return false
      }
    }

    const sites = p.lookFor(LOOK_CONSTRUCTION_SITES)
    if (sites.length) return false

    const err = this.room.createConstructionSite(p, stype)
    if (err !== OK) {
      debug.log(`Bad Construction ${p}:${stype}:${err}`)
      return false
    }
    return `${stype}${p}`
  }
}
