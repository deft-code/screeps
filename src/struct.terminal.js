const lib = require('lib')
const debug = require('debug')
const k = require('constants')

const kEnergyLow = 50000
const kEnergyHi = 60000
const kMaxMineral = 35000

let gCache = {}

class TerminalExtra {
  energyFill () {
    return this.store.energy < kEnergyLow
  }

  energyDrain () {
    return this.store.energy > kEnergyHi
  }

  calc (resource) {
    if (gCache.time !== Game.time) {
      gCache = {
        time: Game.time,
        min: {},
        max: {}
      }
    }

    if (gCache[resource]) {
      return gCache[resource]
    }

    const orders = Game.market.getAllOrders({resourceType: resource})
    let mn = null
    let mx = null
    for (const order of orders) {
      if (order.amount < 100) continue

      // Exclude my own orders
      if (Game.market.orders[order.id]) continue

      if (order.type === ORDER_BUY) {
        if (!mx) {
          mx = order
        } else if (mx.price < order.price) {
          mx = order
        } else if (mx.price === order.price) {
          const mdist = Game.market.calcTransactionCost(1000, this.room.name, mx.roomName)
          const odist = Game.market.calcTransactionCost(1000, this.room.name, order.roomName)
          if (odist < mdist) {
            mx = order
          }
        }
      } else {
        // Prevent wild sell orders from bankrupting me.
        if (order.price > 10) continue

        if (!mn) {
          mn = order
        } else if (mn.price > order.price) {
          mn = order
        } else if (mn.price === order.price) {
          const mdist = Game.market.calcTransactionCost(1000, this.room.name, mn.roomName)
          const odist = Game.market.calcTransactionCost(1000, this.room.name, order.roomName)
          if (odist < mdist) {
            mn = order
          }
        }
      }
    }

    gCache[resource] = [mn && mn.id, mx && mx.id]
    return gCache[resource]
  }

  min (resource) {
    return Game.market.getOrderById(this.calc(resource)[0])
  }

  max (resource) {
    return Game.market.getOrderById(this.calc(resource)[1])
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

    const order = _.min(orders, o =>
      100000 * o.price + Game.market.calcTransactionCost(1000, this.room.name, o.roomName))
    // Order might be Infinity, but it will result in ERR_INVALID_ARGS

    return this.deal(order, amount)
  }

  deal (order, amount = 1000) {
    const err = Game.market.deal(order.id, Math.min(order.amount, amount), this.room.name)
    this.room.log(`${lib.errStr(err)} ${JSON.stringify(order)}`)
    return err
  }

  buyOrder (resource, amount = 10000) {
    const m = Memory.market[resource]
    const p = Math.min(Math.max(m.buy + 1, m.buy95), Math.round(1.1 * m.buy99))
    return this.order(ORDER_BUY, resource, p, amount)
  }

  sellOrder (resource, amount = 10000) {
    const m = Memory.market[resource]
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
    this.room.log(`Creating order:'${err}' ${resource}`)
    return err
  }

  autoBuy (mineral) {
    if (!_.contains(k.CoreMinerals, mineral)) return false
    if (Game.market.credits < 100000) return false
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
  debug.log('BALANCED', err, send.room.name, recv.room.name, amount)
  return err === OK
}

exports.run = function (x) {
  mineralBalance() ||
    energyBalance() ||
    sellOff()
}
