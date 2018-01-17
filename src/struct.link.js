const lib = require('lib')
const debug = require('debug')

class Link {
  calcMode () {
    const src = _.find(this.room.find(FIND_SOURCES), s => this.pos.inRangeTo(s, 2))
    if (src) {
      return 'src'
    }

    if (this.room.storage && this.pos.inRangeTo(this.room.storage, 2)) {
      return 'sink'
    }

    if (this.room.terminal && this.pos.inRangeTo(this.room.terminal, 2)) {
      return 'sink'
    }

    if (this.pos.inRangeTo(this.room.controller, 4)) {
      return 'sink'
    }
    return 'src'
  }

  set mode (val) {
    switch (val) {
      case 'src':
      case 'sink':
        this.room.memory.links[this.id].mode = val
        return val
    }
    delete this.room.memory.links[this.id]
  }

  get mode () {
    let mem = this.room.memory.links[this.id]
    if (!_.isObject(mem)) {
      mem = this.room.memory.links[this.id] = {
        note: this.note,
        mode: this.calcMode()
      }
      this.room.log('calculating link mode', JSON.stringify(mem))
    }
    return mem.mode
  }

  xferHalf (target) {
    const e = Math.floor(target.energyFree / 2)
    return this.xferRaw(target, e)
  }

  xfer (target, mod = 33) {
    // sad trombone
    // let e = Math.min(this.energy, Math.ceil(target.energyFree * (1 + LINK_LOSS_RATIO)));
    let e = Math.min(this.energy, target.energyFree)
    e -= (e % 100) % mod
    return this.xferRaw(target, e)
  }

  xferAll (target) {
    return this.xfer(target, 1)
  }

  xferRaw (target, energy) {
    const err = this.transferEnergy(target, energy)
    return err === OK
  }

  run () {
    if (this.cooldown) return false
    if (this.energy < 33) return false

    switch (this.mode) {
      case 'sink':
        return false
      case 'src':
        return this.runSrc()
    }
    debug.log(`bad mode ${this.mode}`)
    this.mode = null
    return false
  }

  runSrc () {
    const links = _.shuffle(this.room.findStructs(STRUCTURE_LINK))

    const sink = _.find(links, link => link.mode === 'sink' && link.energyFree >= 32)
    if (sink) return this.xfer(sink)

    if (this.energyFree) return false

    const balance = _.max(links, 'energyFree')
    if (balance && balance.energyFree > 4) {
      return this.xferHalf(balance)
    }

    return false
  }
}

lib.merge(StructureLink, Link)

const balanceCache = {}

function balanceLinks (room) {
  const links = room.findStructs(STRUCTURE_LINK)
  if (links.length < 2) return

  let cache = balanceCache[room.name]
  if (!cache || links.length !== cache.nlinks) {
    room.log('refresh links', links.length, JSON.stringify(cache))
    cache = {
      nlinks: links.length
    }

    const ctrl = room.controller.pos.findClosestByRange(links)
    if (ctrl.pos.inRangeTo(room.controller, 4)) {
      cache.ctrl = ctrl.id
      room.visual.text('ctrl', ctrl.pos.x, ctrl.pos.y + 1)
    }

    const store = room.storage.pos.findClosestByRange(links)
    if (store.pos.inRangeTo(room.storage, 2)) {
      cache.store = store.id
      room.visual.text('store', store.pos.x, store.pos.y + 1)
    }

    const term = room.terminal.pos.findClosestByRange(links)
    if (term.pos.inRangeTo(room.terminal, 2)) {
      cache.term = term.id
      room.visual.text('term', term.pos.x, term.pos.y + 1)
    }
    balanceCache[room.name] = cache
  }

  const ctrl = lib.lookup(cache.ctrl)
  const store = lib.lookup(cache.store)
  const term = lib.lookup(cache.term)
  if (ctrl) {
    ctrl.mode = 'sink'
    if (ctrl.energy === 0) {
      if (store) {
        if (term) {
          if (room.storage.store.energy > room.terminal.store.energy) {
            store.mode = 'src'
          } else {
            term.mode = 'src'
          }
        } else {
          store.mode = 'src'
        }
      } else if (term) {
        term.mode = 'src'
      }
      cache.lock = Game.time + 50
      return
    }
  }

  if (!term) return
  if (!store) return
  if (cache.lock > Game.time) return

  term.mode = 'sink'
  store.mode = 'sink'

  const te = room.terminal.store.energy
  const se = room.storage.store.energy

  if ((te > 20000 && se < 150000) || (te > 50000 && se < 950000)) {
    term.mode = 'src'
    cache.lock = Game.time + 100
    return
  }

  if (te < 40000 && se > 200000) {
    store.mode = 'src'
    cache.lock = Game.time + 100
  }
}

Room.prototype.runLinks = function () {
  if (!this.controller) return
  if (!this.controller.my) return

  if (!this.memory.links) {
    this.memory.links = {}
    this.log('Creating links memory')
  }

  const links = _.shuffle(this.findStructs(STRUCTURE_LINK))
  let ran = false
  for (const link of links) {
    if (!ran) {
      ran = link.run()
    }
    this.visual.text(link.mode, link.pos)
  }
  balanceLinks(this)
}
