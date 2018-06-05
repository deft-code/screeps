const lib = require('lib')
const debug = require('debug')
const k = require('constants')

const kEnergyLow = 50000
const kEnergyHi = 60000
const kMaxMineral = 35000

const kMinCredits = Game.shard.name === 'swc' ? 10000 : 100000

class TerminalExtra {
  energyFill () {
    return this.store.energy < kEnergyLow
  }

  energyDrain () {
    return this.store.energy > kEnergyHi
  }

  sell (resource, amount = 1000) {
    const orders = _.filter(
      Game.market.getAllOrders({resourceType: resource}),
      o => !Game.market.orders[o.id] && o.type === ORDER_BUY && o.amount > 0)

    const order = _.max(orders, o =>
      100000 * o.price + Game.market.calcTransactionCost(1000, this.room.name, o.roomName))
    // Order might be -Infinity, but it will result in ERR_INVALID_ARGS

    return this.deal(order, amount)
  }

  buy (resource, amount = 1000) {
    const orders = _.filter(
      Game.market.getAllOrders({resourceType: resource}),
      o => !Game.market.orders[o.id] && o.type === ORDER_SELL && o.amount > 0)
    return this.doBuy(orders, amount)
  }

  safeBuy (resource, amount = 1000) {
    const m = Memory.market[resource]
    if (!m) return ERR_NOT_FOUND
    const max = (1.1 * m.sell99) / 1000
    const orders = _.filter(
      Game.market.getAllOrders({resourceType: resource}),
      o => !Game.market.orders[o.id] && o.type === ORDER_SELL && o.amount > 0 && o.price < max)
    return this.doBuy(orders, amount)
  }

  doBuy (orders, amount) {
    const order = _.min(orders, o =>
      100000 * o.price + Game.market.calcTransactionCost(1000, this.room.name, o.roomName))
    // Order might be Infinity, but it will result in ERR_INVALID_ARGS

    return this.deal(order, amount)
  }

  deal (order, amount = 1000) {
    if (!_.isObject(order)) {
      const o = Game.market.getOrderById(order)
      if (!o) {
        this.room.dlog('bad order', order)
        return ERR_INVALID_ARGS
      }
      order = o
    }
    const n = Math.min(order.amount, amount)
    const err = Game.market.deal(order.id, n, this.room.name)
    this.room.log(`${lib.errStr(err)}, ${n}, ${JSON.stringify(order)}`)
    return err
  }

  buyOrder (resource, amount = 10000) {
    const m = Memory.market[resource]
    const p = Math.min(Math.max(m.buy + 1, m.buy95), Math.round(1.1 * m.buy99))
    return this.order(ORDER_BUY, resource, p, amount)
  }

  sellOrder (resource, amount = 10000) {
    const m = Memory.market[resource]
    if (!m || !m.sell) {
      this.room.dlog('Bad market', resource, amount)
      return
    }
    const p = Math.max(Math.min(m.sell - 1, m.sell95), Math.round(0.9 * m.sell99))
    return this.order(ORDER_SELL, resource, p, amount)
  }

  order (type, resource, price, amount) {
    const myOrder = _.find(
      Game.market.orders,
      o =>
        o.roomName === this.room.name &&
        o.type === type &&
        o.resourceType === resource)

    if (myOrder) {
      const op = Math.round(myOrder.price * 1000)
      const dp = Math.abs(op - price)
      if (price < 10 * dp) {
        const err = Game.market.changeOrderPrice(myOrder.id, price / 1000)
        this.room.log(`Updating price:'${err}' to ${price} on ${JSON.stringify(myOrder)}`)
        if (err !== OK) {
          return err
        }
      }
      if (2 * myOrder.remainingAmount < amount) {
        const err = Game.market.extendOrder(myOrder.id, amount - myOrder.remainingAmount)
        debug.log(`Updating amount:'${err}' to ${amount}: ${JSON.stringify(myOrder)}`)
        if (err !== OK) {
          return err
        }
      }
      return OK
    }

    const err = Game.market.createOrder(type, resource, price / 1000, amount, this.room.name)
    this.room.log(`Creating order:${lib.errStr(err)} ${resource} ${price}x${amount}`)
    return err
  }

  autoBuy (mineral) {
    if (!_.contains(k.CoreMinerals, mineral)) return false
    this.room.log('credits', Game.market.credits, kMinCredits, Game.market.credits, kMinCredits)
    if (Game.market.credits < kMinCredits) return false
    const err = this.safeBuy(mineral)
    this.room.log('AUTOBUY', lib.errStr(err), mineral)
    this.buyOrder(mineral)
  }
}

lib.merge(StructureTerminal, TerminalExtra)

StructureTerminal.prototype.requestMineral = function (mineral, max = 1000) {
  const terminals = _.filter(Game.terminals,
    t => !t.cooldown && t.id !== this.id && t.store[mineral] > 200)
  if (terminals.length === 0) return false

  const best = _.max(terminals, t => t.store[mineral])
  const num = Math.min(max, Math.floor(best.store[mineral] / 2))
  const err = best.send(mineral, num, this.room.name)
  this.room.log(`Terminal send ${lib.errStr(err)}: ${best.room.name} ${mineral}x${num}`)
  return best.room.name
}

function mineralBalance () {
  const terminals = _.shuffle(Game.terminals)
  for (const t of terminals) {
    if (t.storeTotal > 250000) continue
    const rs = _.shuffle(_.uniq(_.map(t.room.findStructs(STRUCTURE_LAB), l => l.planType))).concat(k.ReactOrder)
    for (const r of rs) {
      if (!r) continue
      if (t.store[r] > 100) continue
      const ret = t.requestMineral(r)
      if (ret) return ret
      t.autoBuy(r)
    }
  }
}

function sellOff () {
  const ts = _.shuffle(Game.terminals)
  for (const t of ts) {
    if (t.cooldown) continue
    if (t.storeTotal < 150000) continue
    const rs = _.shuffle(_.keys(t.store))
    t.room.dlog('resources', rs)
    for (const r of rs) {
      if (r === RESOURCE_ENERGY) continue
      if (r === RESOURCE_POWER) continue
      if (t.store[r] > kMaxMineral) {
        t.sellOrder(r)
        if (t.store.energy > 1000) {
          if (t.sell(r) === OK) {
            t.room.log('auto sale!', r)
            return 'sell:' + r
          }
        }
      }
    }
  }
  return false
}

function energyBalance () {
  const max = _.max(Game.terminals, 'store.energy')
  // debug.log('max', max.room, max.store.energy)
  const send = _.find(Game.terminals, t =>
    t.store.energy >= max.store.energy - 10000 &&
    t.store.energy > 15000 &&
    !t.cooldown)
  if (!send) return false
  // debug.log('send', send.room, send.store.energy)

  const recv = _.find(Game.terminals, t =>
    send.store.energy - t.store.energy > 10000 &&
    t.storeFree > 1 &&
    t.storeFree >= t.store.energy)
  if (!recv) return false
  const delta = (send.store.energy - recv.store.energy) / 3
  const amount = Math.floor(Math.min(delta, recv.storeFree / 2))
  // debug.log('recv', recv.room, recv.store.energy, delta, amount)
  const err = send.send(RESOURCE_ENERGY, amount, recv.room.name)
  debug.log('BALANCED', lib.errStr(err), send.room.name, recv.room.name, amount)
  return err === OK
}

function cleanup () {
  const n = _.size(Game.market.orders)
  if (n < 49) return false
  const done = _.filter(Game.market.orders, o => o.remainingAmount <= 0)
  debug.log(`Cleaning up ${done.length} orders`)
  for (const order of done) {
    const err = Game.market.cancelOrder(order.id)
    if (err !== OK) {
      debug.log('BAD Cancel', lib.errStr(err), JSON.stringify(order))
    }
  }
  return true
}

exports.run = function (x) {
  cleanup() ||
    mineralBalance() ||
    energyBalance() ||
    sellOff()
}
