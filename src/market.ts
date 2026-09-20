import { getAllOrders, marketDisabled } from 'markethack';

declare global {
  // Prices in milli-credits (credits * 1000, integers). buy/sell are the last
  // tick price taken; xx95/xx99 are moving averages of it with weights 1/20 and
  // 1/100 per sample, and xx9500/xx9900 the same averages * 100 so the integer
  // rounding does not eat slow drifts. A sample is taken at most once a tick,
  // whenever getBuyOrderPrice/getSellOrderPrice is asked (not on a fixed schedule). A
  // side is absent until its first price. Energy is priced as delivered to /
  // shipped from the asking room, see below.
  interface MarketInfo {
    buy?: number
    buy95?: number
    buy99?: number
    buy9500?: number
    buy9900?: number

    sell?: number
    sell95?: number
    sell99?: number
    sell9500?: number
    sell9900?: number
  }

  interface Memory {
    market: Partial<Record<ResourceConstant, MarketInfo>>
  }
}

if (!Memory.market) Memory.market = {};

// getBuyOrderPrice(res)  what selling `res` into the market's buy orders pays,
// getSellOrderPrice(res) what buying `res` from the market's sell orders costs,
// both in credits per unit: the average over the best kPriceUnits units on
// that side of the book (highest bids, lowest asks), our own orders left out.
// Orders come through markethack (raw order table, API as fallback). The
// answer is computed once per tick, resource, side and room; computing it also
// feeds the Memory.market averages. With under kPriceUnits units on offer (or
// no market at all: the season shard) there is no price: nothing is recorded
// and the call throws, again from the cache for the rest of the tick. The
// tryGet variants swallow that and answer -Infinity (buy) / Infinity (sell),
// so "is this worth it" comparisons fail safe.
//
// Energy is special because shipping is paid in energy by whoever deals.
// Buying N from a seller at transfer rate r delivers N but burns N*r, so a
// unit gained costs price / (1 - r); selling N burns N*r more, so a unit spent
// earns price / (1 + r). Energy orders are ranked and priced by that effective
// price relative to `roomName` (default: our first room with a terminal), so
// the energy price is the best kPriceUnits units by effective price, not by
// listed price. Memory.market.energy holds effective prices too.
const kPriceUnits = 10000;

type Side = "buy" | "sell";
interface Offer {
  price: number
  amount: number
}

let priceTick = -1;
let priceCache = new Map<string, number | Error>();
let tickTerminalRoom: string | undefined;

export function getBuyOrderPrice(res: ResourceConstant, roomName?: string): number {
  return tickPrice("buy", res, roomName);
}

export function getSellOrderPrice(res: ResourceConstant, roomName?: string): number {
  return tickPrice("sell", res, roomName);
}

export function tryGetBuyOrderPrice(res: ResourceConstant, roomName?: string): number {
  try {
    return getBuyOrderPrice(res, roomName);
  } catch (err) {
    return -Infinity;
  }
}

export function tryGetSellOrderPrice(res: ResourceConstant, roomName?: string): number {
  try {
    return getSellOrderPrice(res, roomName);
  } catch (err) {
    return Infinity;
  }
}

// Units of `res` anyone but us is bidding for right now; 0 off-market.
export function bidUnits(res: ResourceConstant): number {
  if (marketDisabled()) return 0;
  return _.sum(getAllOrders({ type: ORDER_BUY, resourceType: res }),
    o => Game.market.orders[o.id] ? 0 : Math.max(o.amount, 0));
}

// Transfer energy per unit shipped between two rooms; distances never change.
const rates = new Map<string, number>();
function transferRate(roomA: string, roomB: string): number {
  const key = roomA + roomB;
  let rate = rates.get(key);
  if (rate === undefined) {
    rate = Game.market.calcTransactionCost(kPriceUnits, roomA, roomB) / kPriceUnits;
    rates.set(key, rate);
  }
  return rate;
}

// Effective energy price of `order` for a terminal in `roomName`, see above.
export function energyPrice(order: Order, roomName: string): number {
  if (!order.roomName) return order.price;
  const rate = transferRate(roomName, order.roomName);
  if (order.type === ORDER_BUY) return order.price / (1 + rate);
  return rate < 1 ? order.price / (1 - rate) : Infinity;
}

function tickPrice(side: Side, res: ResourceConstant, roomName?: string): number {
  if (priceTick !== Game.time) {
    priceTick = Game.time;
    priceCache = new Map();
    const room = _.find(Game.rooms, r => !!r.terminal && r.terminal.my);
    tickTerminalRoom = room && room.name;
  }
  // Only energy prices depend on the room.
  roomName = res === RESOURCE_ENERGY ? roomName || tickTerminalRoom : undefined;
  const key = side + res + (roomName || "");
  let price = priceCache.get(key);
  if (price === undefined) {
    try {
      price = computePrice(side, res, roomName);
      // One energy average, so only our own terminal room's view feeds it.
      if (!roomName || roomName === tickTerminalRoom) record(side, res, price);
    } catch (err) {
      price = err as Error;
    }
    priceCache.set(key, price);
  }
  if (typeof price !== "number") throw price;
  return price / 1000;
}

// Milli-credits per unit over the best kPriceUnits units; throws when short.
function computePrice(side: Side, res: ResourceConstant, roomName?: string): number {
  if (marketDisabled()) throw new Error(`no market on ${Game.shard.name}`);
  const type = side === "buy" ? ORDER_BUY : ORDER_SELL;
  const offers: Offer[] = getAllOrders({ type, resourceType: res })
    .filter(o => !Game.market.orders[o.id] && o.amount > 0)
    .map(o => ({ price: roomName ? energyPrice(o, roomName) : o.price, amount: o.amount }));
  offers.sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price);
  const price = meanOfFirst(offers, kPriceUnits);
  if (price === undefined) {
    throw new Error(`only ${_.sum(offers, o => o.amount)} of ${kPriceUnits} units of ${res} in ${side} orders`);
  }
  return Math.floor(1000 * price);
}

// Fold a tick price (milli-credits) into Memory.market[res].
function record(side: Side, res: ResourceConstant, price: number) {
  const m = (Memory.market[res] = Memory.market[res] || {}) as Record<string, number>;
  m[side] = price;
  for (const [pct, n] of [["95", 20], ["99", 100]] as [string, number][]) {
    const avg = side + pct;
    const fine = avg + "00";
    if (m[avg] === undefined) m[avg] = price;
    if (m[fine] === undefined) m[fine] = m[avg] * 100;
    m[fine] = Math.round((m[fine] * (n - 1) + price * 100) / n);
    m[avg] = Math.round(m[fine] / 100);
  }
}

// Amount-weighted mean price of the first `n` units; undefined when short.
function meanOfFirst(offers: Offer[], n: number): number | undefined {
  let sum = 0;
  let summed = 0;
  for (const o of offers) {
    const take = Math.min(o.amount, n - summed);
    sum += o.price * take;
    summed += take;
    if (summed >= n) return sum / n;
  }
  return undefined;
}
