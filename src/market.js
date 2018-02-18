const debug = require('debug')
const k = require('constants')

if (!Memory.market) {
  Memory.market = {}
}

exports.run = function () {
  const r = k.CoreMinerals[Game.time % k.CoreMinerals.length]

  const buys = _.filter(
    Game.market.getAllOrders({resourceType: r}),
    o => !Game.market.orders[o.id])
  const sells = _.remove(buys, o => o.type === ORDER_SELL)

  buys.sort((a, b) => b.price - a.price)
  sells.sort((a, b) => a.price - b.price)

  const bPrice = sumFirst(buys)
  const sPrice = sumFirst(sells)

  if (!Memory.market[r]) {
    Memory.market[r] = {
      buy: bPrice,
      buy95: bPrice,
      buy99: bPrice,

      sell: sPrice,
      sell95: sPrice,
      sell99: sPrice
    }
    return
  }

  const m = Memory.market[r]

  if (bPrice > 0) {
    m.buy = bPrice
    m.buy95 = Math.round((m.buy95 * 19 + bPrice) / 20)
    m.buy99 = Math.round((m.buy99 * 99 + bPrice) / 100)
  } else {
    debug.log('Too Few buy offers', r)
  }

  if (sPrice > 0) {
    m.sell = sPrice
    m.sell95 = Math.round((m.sell95 * 19 + sPrice) / 20)
    m.sell99 = Math.round((m.sell99 * 99 + sPrice) / 100)
  } else {
    debug.log('Too Few sell offers', r)
  }
}

function sumFirst (orders, n = 10000) {
  let sum = 0
  let summed = 0
  for (const o of orders) {
    const on = Math.min(o.amount, n - summed)
    sum += 1000 * o.price * on
    summed += on
    if (summed >= n) break
  }

  if (summed < n) return 0
  return Math.floor(sum / n)
}
