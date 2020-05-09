import * as lib from 'lib';
import * as debug from 'debug';
import * as k from 'constants';
import { mineralPlan } from 'struct.lab';

const kEnergyLow = 50000
const kEnergyHi = 60000
const kMaxMineral = 35000
const kMaxEnergy = 100000

// Set this really high while market code is new
const kMinCredits = 4000000 // 100000

class TerminalExtra {
  energyFill() {
    return this.store.energy < kEnergyLow
  }

  energyDrain() {
    return this.store.energy > kEnergyHi
  }

  sell(resource, amount = 1000) {
    const orders = _.filter(
      Game.market.getAllOrders({ resourceType: resource }),
      o => !Game.market.orders[o.id] && o.type === ORDER_BUY && o.amount > 0)

    const order = _.max(orders, o =>
      100000 * o.price + Game.market.calcTransactionCost(1000, this.room.name, o.roomName))
    // Order might be -Infinity, but it will result in ERR_INVALID_ARGS

    return this.deal(order, amount)
  }

  buy(resource, amount = 1000, max = 5) {
    const orders = _.filter(
      Game.market.getAllOrders({ resourceType: resource }),
      o => !Game.market.orders[o.id] && o.type === ORDER_SELL && o.amount > 0 && o.price < max)
    return this.doBuy(orders, amount)
  }

  safeBuy(resource, amount = 1000) {
    const m = Memory.market[resource]
    if (!m) return ERR_NOT_FOUND
    const max = (1.1 * m.sell99) / 1000
    const orders = _.filter(
      Game.market.getAllOrders({ resourceType: resource }),
      o => !Game.market.orders[o.id] && o.type === ORDER_SELL && o.amount > 0 && o.price < max)
    return this.doBuy(orders, amount)
  }

  doBuy(orders, amount) {
    const order = _.min(orders, o =>
      100000 * o.price + Game.market.calcTransactionCost(1000, this.room.name, o.roomName))
    // Order might be Infinity, but it will result in ERR_INVALID_ARGS

    return this.deal(order, amount)
  }

  deal(order, amount = 1000) {
    if (!_.isObject(order)) {
      const o = Game.market.getOrderById(order)
      if (!o) {
        this.room.dlog('bad order', order)
        return ERR_INVALID_ARGS
      }
      order = o
    }
    const n = Math.min(order.amount, amount)
    return debug.log('delt', Game.market.deal(order.id, n, this.room.name), n, JSON.stringify(order));
  }

  buyOrder(resource, amount = 10000) {
    const m = Memory.market[resource]
    const p = Math.min(Math.max(m.buy + 1, m.buy95), Math.round(1.1 * m.buy99))
    return this.order(ORDER_BUY, resource, p, amount)
  }

  sellOrder(resource, amount = 10000) {
    const m = Memory.market[resource]
    if (!m || !m.sell) {
      this.room.dlog('Bad market', resource, amount)
      return
    }
    const p = Math.max(Math.min(m.sell - 1, m.sell95), Math.round(0.9 * m.sell99))
    return this.order(ORDER_SELL, resource, p, amount)
  }

  order(type, resource, price, amount) {
    let myOrder;
    if (resource === RESOURCE_ENERGY || type === ORDER_SELL) {
      myOrder = _.find(
        Game.market.orders,
        o =>
          o.roomName === this.pos.roomName &&
          o.type === type &&
          o.resourceType === resource)

    } else {
      myOrder = _.find(
        Game.market.orders,
        o =>
          Game.map.getRoomLinearDistance(o.roomName, this.room.name, true) < 10 &&
          o.type === type &&
          o.resourceType === resource)
    }

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
        this.room.log('Updating amount', debug.errStr(err), amount, JSON.stringify(myOrder));
        if (err !== OK) {
          return err
        }
      }
      return OK
    }

    const err = Game.market.createOrder(type, resource, price / 1000, amount, this.room.name)
    this.room.log(`Creating order:${debug.errStr(err)} ${resource} ${price}x${amount}`)
    return err
  }

  autoBuy(mineral) {
    if (!_.contains(k.CoreMinerals, mineral)) return false
    if (Game.market.credits < kMinCredits) return false
    const err = this.safeBuy(mineral)
    //this.room.errlog(err, 'AUTOBUY', mineral);
    if (err === ERR_FULL) {
      return err;
    }
    return this.buyOrder(mineral)
  }
}

lib.merge(StructureTerminal, TerminalExtra)

StructureTerminal.prototype.requestMineral = function (mineral, max = 1200) {
  const terminals = _.filter(Game.terminals,
    t => !t.cooldown && t.id !== this.id && t.store[mineral] > 200)
  if (terminals.length === 0) return false

  const best = _.max(terminals, t => t.store[mineral])
  const num = Math.min(max, Math.floor(best.store[mineral] / 2))
  const err = best.send(mineral, num, this.room.name)
  this.room.errlog(err, `Terminal send: ${best.room.name} ${mineral}x${num}`)
  return best.room.name
}

function mineralBalance() {
  let autobuy = true;
  const terminals = _.shuffle(Game.terminals)
  const baseBoosts = _.map(mineralPlan(), e => e[0]);
  for (const t of terminals) {
    if (t.store.getUsedCapacity() > 250000) continue
    const rs = _.shuffle(_.uniq(_.map(t.room.findStructs(STRUCTURE_LAB), l => l.planType))).concat(baseBoosts);

    for (const r of rs) {
      if (!r) continue
      if (t.store[r] > 100) continue
      const ret = t.requestMineral(r)
      //t.room.log("request ret", ret, r, rs);
      if (ret) return ret
      if (autobuy) {
        const err = t.autoBuy(r);
        if(err !== false) t.room.errlog(err, "autobuying", r);
        autobuy = err != ERR_FULL;
      }
    }
  }
}

function sellOff() {
  const ts = _.shuffle(Game.terminals)
  for (const t of ts) {
    if (t.cooldown) continue
    if (t.store.getUsedCapacity() < 150000) continue
    const rs = _.shuffle(_.keys(t.store))
    t.room.dlog('resources', rs)
    for (const r of rs) {
      if (r === RESOURCE_POWER) continue

      if (t.store[r] < kMaxMineral) continue
      if (r === RESOURCE_ENERGY && t.store[r] < kMaxEnergy) continue
      t.sellOrder(r)
      if (t.store.energy > 1000) {
        if (t.sell(r) === OK) {
          t.room.log('auto sale!', r)
          return 'sell:' + r
        }
      }
    }
  }
  return false
}

function energyBalance() {
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
    t.store.getFreeCapacity() > 1 &&
    t.store.getFreeCapacity() >= t.store.energy)
  if (!recv) return false
  const delta = (send.store.energy - recv.store.energy) / 3
  const amount = Math.floor(Math.min(delta, recv.store.getFreeCapacity() / 2))
  // debug.log('recv', recv.room, recv.store.energy, delta, amount)
  const err = send.send(RESOURCE_ENERGY, amount, recv.room.name)
  debug.log('BALANCED', debug.errStr(err), send.room.name, recv.room.name, amount)
  return err === OK
}

function cleanup() {
  const n = _.size(Game.market.orders)
  if (n < MARKET_MAX_ORDERS - 1) return false
  const done = _.filter(Game.market.orders, o => o.remainingAmount <= 0)
  if (done.length) {
    debug.log(`Cleaning up ${done.length} orders`)
    for (const order of done) {
      debug.errlog(Game.market.cancelOrder(order.id), 'bad cancel', JSON.stringify(order));
    }
  } else {
    const o = _.sample(Game.market.orders);
    debug.errlog(Game.market.cancelOrder(o.id), JSON.stringify(o));
  }
  return true
}

function energySell() {
  const send = _.find(Game.terminals, t => t.store.energy > 70000 && !t.cooldown && t.room.storage && t.room.storage.store.energy > 500000);
  if (!send) return false;
  send.sellOrder(RESOURCE_ENERGY);
  if (send.sell(RESOURCE_ENERGY, 5000) === OK) {
    send.room.log('auto energy sale!')
    return 'sell: energy';
  }
  return true;
}

exports.run = function (x) {
  cleanup() ||
    mineralBalance() ||
    energyBalance() ||
    energySell() ||
    sellOff()
}
