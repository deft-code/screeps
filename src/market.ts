import { getAllOrders, marketDisabled } from 'markethack';
import { daemon, Priority, Process } from 'process';
import { msPerTick } from 'pace';
import { hasBlocked, isBlocked, isSuspect } from 'marketcfg';
import { depthFor } from 'stockrules';

// Market prices and their history. Design: docs/market-design.md.
//
// getBuyOrderPrice(res)  what selling `res` into the market's buy orders pays,
// getSellOrderPrice(res) what buying `res` from the market's sell orders costs,
// both in credits per unit: the amount-weighted average over the best
// depthFor(res) units on that side of the book (highest bids, lowest asks),
// our own orders and the orders of blacklisted players left out. Orders come
// through markethack (raw order table, API as fallback). The answer is
// computed once per tick, resource, side and room; with fewer units on offer
// than the depth (or no market at all: the season shard) there is no price:
// the call throws, again from the cache for the rest of the tick. The tryGet
// variants swallow that and answer -Infinity (buy) / Infinity (sell), so
// "is this worth it" comparisons fail safe.
//
// Energy is special because shipping is paid in energy by whoever deals.
// Buying N from a seller at transfer rate r delivers N but burns N*r, so a
// unit gained costs price / (1 - r); selling N burns N*r more, so a unit spent
// earns price / (1 + r). Energy orders are ranked and priced by that effective
// price relative to `roomName` (default: our first room with a terminal), so
// the energy price is the best units by effective price, not by listed price.
// Memory.market.energy holds effective prices too.
//
// Tracking, per side of each resource (milli-credits, Memory.market[res]):
//
//   now   the last price computed, whenever one was asked
//   mid   a moving average, folded once per refresh: every kRefresh +- kFuzz
//         ticks, when a price is asked after the deadline (on demand) or by
//         the MarketTracker daemon when nobody asked (two overdue resources a
//         tick). Its ratio matches the refreshes in an hour (midAlpha), so it
//         stands for about the last hour whatever the tick rate.
//   h     a round-robin history of mid: buckets of 1, 2, 4 and 8 hours with two
//         slots each. Every hour (ticks from the pacer, +-10% fuzz) mid is
//         pushed into the 1h bucket; a bucket about to hold a third value
//         averages its two oldest into the next bucket; out of the 8h bucket
//         the pair is dropped. 15-30 hours of history. slowOf() is its
//         duration-weighted mean, the "slow" the signals read.
//
// A fold clamps the sample to +-25% of slow, so one wild order moves the
// averages by a bounded step; a suspect resource (marketcfg) folds nothing
// and pushes nothing until it is cleared. A new record is pre-populated from
// its first price (the one-time migration from the 2020 layout seeds mid and
// the 1h/2h slots from buy95 and the 4h/8h slots from buy99).

declare global {
  interface SideTrack {
    now?: number
    mid?: number
    // kBuckets lists, oldest value first, at most 2 each.
    h?: number[][]
  }

  interface MarketInfo {
    v: 2
    b: SideTrack
    s: SideTrack
    // Tick of the next fold (refresh deadline) and of the next history push.
    due: number
    hdue: number
  }

  interface Memory {
    market: Partial<Record<ResourceConstant, MarketInfo>>
  }
}

// Ticks between folds, and the fuzz on each deadline.
const kRefresh = 100;
const kFuzz = 20;
// A record this many ticks past its deadline is refreshed by the daemon.
const kOverdue = 20;
// Most records the daemon refreshes in one tick.
const kPerTick = 2;
// Ticks between looks at the book for resources it does not know yet.
const kDiscover = 500;
const kBuckets = 4;
// Hours each bucket's slot stands for, oldest bucket last.
const kBucketHours = [1, 2, 4, 8];
// Sample clamp around slow for the fold.
const kClamp = 0.25;
// Intershard resources never priced here (their own triage, later).
const kSkip = ["cpuUnlock", "accessKey", "token"];

type Side = "buy" | "sell";
interface Offer {
  price: number
  amount: number
}

if (!Memory.market) Memory.market = {};
migrate();

// --- pricing ----------------------------------------------------------------

let priceTick = -1;
let priceCache = new Map<string, number | Error>();
let tickTerminalRoom: string | undefined;

export function getBuyOrderPrice(res: ResourceConstant, roomName?: string): number {
  return tickPrice("buy", res, roomName) / 1000;
}

export function getSellOrderPrice(res: ResourceConstant, roomName?: string): number {
  return tickPrice("sell", res, roomName) / 1000;
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

// The moving average (mid, about the last hour) of the buy-order price, in
// credits. Prices the resource first (from the tick's cache when it was
// already asked), which folds the sample in when a refresh is due. -Infinity
// while the resource has never had a buy price.
export function buyOrderPriceEma(res: ResourceConstant, roomName?: string): number {
  tryGetBuyOrderPrice(res, roomName);
  const mid = Memory.market[res]?.b.mid;
  return mid === undefined ? -Infinity : mid / 1000;
}

// Credits a unit of energy is worth to a room: energy's bid-side slow (what
// selling it fetches; the delivered ask overstated it by the transfer energy
// of far orders, ~4x, until 7 Nov 2026), scaled by how full of energy the
// room's storage is. At or under half its capacity the full price; from there
// linearly down to nothing at capacity (the energy has nowhere better to go).
// No room in sight or no storage: the full price. The trader's transfer
// energy cost and the swipe worth test (swipeworth.ts) both use it.
export function energyValue(room?: Room): number {
  const slow = slowOf(trackOf(RESOURCE_ENERGY, "buy"));
  const price = slow === undefined ? Math.max(0, tryGetBuyOrderPrice(RESOURCE_ENERGY, room?.name)) : slow / 1000;
  const storage = room?.storage;
  if (!storage) return price;
  const fill = storage.store.energy / storage.store.getCapacity();
  const discount = Math.min(1, Math.max(0, (fill - 0.5) / 0.5));
  return price * (1 - discount);
}

// Units of `res` anyone but us is bidding `minPrice` or more for right now;
// 0 off-market.
export function bidUnits(res: ResourceConstant, minPrice = 0): number {
  if (marketDisabled()) return 0;
  return _.sum(getAllOrders({ type: ORDER_BUY, resourceType: res }),
    o => Game.market.orders[o.id] || o.price < minPrice ? 0 : Math.max(o.amount, 0));
}

// Transfer energy per unit shipped between two rooms; distances never change.
const rates = new Map<string, number>();
export function transferRate(roomA: string, roomB: string): number {
  const key = roomA + roomB;
  let rate = rates.get(key);
  if (rate === undefined) {
    rate = Game.market.calcTransactionCost(10000, roomA, roomB) / 10000;
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

// Our first room with a terminal this tick: the room whose view of energy
// feeds the energy record.
function terminalRoom(): string | undefined {
  if (priceTick !== Game.time) {
    priceTick = Game.time;
    priceCache = new Map();
    const room = _.find(Game.rooms, r => !!r.terminal && r.terminal.my);
    tickTerminalRoom = room && room.name;
  }
  return tickTerminalRoom;
}

// Milli-credits, or throws. Records `now` for the canonical room's view and
// folds when the resource's refresh is due.
function tickPrice(side: Side, res: ResourceConstant, roomName?: string): number {
  const home = terminalRoom();
  // Only energy prices depend on the room.
  roomName = res === RESOURCE_ENERGY ? roomName || home : undefined;
  const key = side + res + (roomName || "");
  let price = priceCache.get(key);
  if (price === undefined) {
    try {
      price = computePrice(side, res, roomName);
      if (!roomName || roomName === home) {
        trackOf(res, side).now = price;
      }
    } catch (err) {
      price = err as Error;
    }
    priceCache.set(key, price);
    if (!roomName || roomName === home) maybeFold(res);
  }
  if (typeof price !== "number") throw price;
  return price;
}

// Milli-credits per unit over the best depthFor(res) units; throws when short.
function computePrice(side: Side, res: ResourceConstant, roomName?: string): number {
  if (marketDisabled()) throw new Error(`no market on ${Game.shard.name}`);
  const type = side === "buy" ? ORDER_BUY : ORDER_SELL;
  const blocked = hasBlocked(res);
  const offers: Offer[] = getAllOrders({ type, resourceType: res })
    .filter(o => !Game.market.orders[o.id] && o.amount > 0 && !(blocked && isBlocked(res, o.roomName)))
    .map(o => ({ price: roomName ? energyPrice(o, roomName) : o.price, amount: o.amount }));
  offers.sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price);
  const depth = depthFor(res);
  const price = meanOfFirst(offers, depth);
  if (price === undefined) {
    throw new Error(`only ${_.sum(offers, o => o.amount)} of ${depth} units of ${res} in ${side} orders`);
  }
  return Math.floor(1000 * price);
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

// --- tracking ---------------------------------------------------------------

export function ticksPerHour(): number {
  return Math.max(60, Math.round(3600000 / msPerTick()));
}

// The moving average's weight on a new sample: the ratio that makes mid an
// average over about an hour of refreshes, 2 / (refreshes per hour + 1).
// About 1:5 at a 4.25 s tick; clamped so a stalled or racing shard cannot
// make it meaningless.
export function midAlpha(): number {
  const perHour = ticksPerHour() / kRefresh;
  return Math.min(0.6, Math.max(0.05, 2 / (perHour + 1)));
}

function infoOf(res: ResourceConstant): MarketInfo {
  let m = Memory.market[res];
  if (!m) {
    m = Memory.market[res] = {
      v: 2, b: {}, s: {},
      due: Game.time + _.random(0, kRefresh + kFuzz),
      hdue: Game.time + _.random(0, ticksPerHour()),
    };
  }
  return m;
}

export function trackOf(res: ResourceConstant, side: Side): SideTrack {
  const m = infoOf(res);
  return side === "buy" ? m.b : m.s;
}

// The history's duration-weighted mean (milli-credits), undefined while empty.
export function slowOf(t: SideTrack | undefined): number | undefined {
  if (!t || !t.h) return undefined;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < kBuckets; i++) {
    for (const v of t.h[i] || []) {
      sum += v * kBucketHours[i];
      weight += kBucketHours[i];
    }
  }
  return weight ? sum / weight : undefined;
}

// Oldest value in the history (the 8h bucket's first slot), for a trend
// read against now.
export function oldestOf(t: SideTrack | undefined): number | undefined {
  if (!t || !t.h) return undefined;
  for (let i = kBuckets - 1; i >= 0; i--) {
    const b = t.h[i];
    if (b && b.length) return b[0];
  }
  return undefined;
}

function filledHistory(v: number): number[][] {
  return kBucketHours.map(() => [v, v]);
}

// Push an hourly value into the 1h bucket and cascade the overflow.
export function pushHistory(h: number[][], v: number) {
  let carry: number | undefined = v;
  for (let i = 0; i < kBuckets && carry !== undefined; i++) {
    const b = h[i] = h[i] || [];
    b.push(carry);
    carry = undefined;
    if (b.length > 2) {
      const a = b.shift()!;
      const c = b.shift()!;
      carry = (a + c) / 2;
    }
  }
}

let folding = false;

// Fold both sides when the resource's refresh is due, and push the hourly
// history when that is due. Called whenever a price of `res` is computed.
function maybeFold(res: ResourceConstant) {
  if (folding) return;
  const m = infoOf(res);
  if (Game.time < m.due) return;
  m.due = Game.time + kRefresh + _.random(-kFuzz, kFuzz);
  const suspect = isSuspect(res);
  const alpha = midAlpha();
  folding = true;
  try {
    for (const side of ["buy", "sell"] as Side[]) {
      let price: number;
      try {
        price = tickPrice(side, res);
      } catch (err) {
        continue;   // thin book: no sample, the average stands
      }
      const t = trackOf(res, side);
      if (t.mid === undefined) {
        t.mid = price;
        t.h = filledHistory(price);
        continue;
      }
      if (suspect) continue;
      const slow = slowOf(t);
      const sample = slow === undefined ? price : Math.min(slow * (1 + kClamp), Math.max(slow * (1 - kClamp), price));
      t.mid = Math.round(t.mid + alpha * (sample - t.mid));
    }
    if (Game.time >= m.hdue) {
      m.hdue = Game.time + Math.round(ticksPerHour() * (0.9 + 0.2 * Math.random()));
      if (!suspect) {
        for (const t of [m.b, m.s]) {
          if (t.mid === undefined) continue;
          t.h = t.h || filledHistory(t.mid);
          pushHistory(t.h, t.mid);
        }
      }
    }
  } finally {
    folding = false;
  }
}

// Price both sides now (folding if due). Thin books are fine.
export function refresh(res: ResourceConstant) {
  tryGetBuyOrderPrice(res);
  tryGetSellOrderPrice(res);
}

// Forget a resource's averages: the next price re-seeds mid and the history.
// For when a blacklist takes a manipulator's orders out of its book.
export function resetTrack(res: ResourceConstant) {
  const m = Memory.market[res];
  if (!m) return;
  m.b = {};
  m.s = {};
  m.due = Game.time;
}

// One-time conversion of the 2020 layout (buy, buy95, buy99, buy9500, ...).
function migrate() {
  for (const res in Memory.market) {
    const old = Memory.market[res as ResourceConstant] as any;
    if (!old || old.v === 2) continue;
    const side = (now?: number, mid?: number, slow?: number): SideTrack => {
      if (now === undefined && mid === undefined) return {};
      const m = mid ?? now!;
      const s = slow ?? m;
      return { now: now ?? m, mid: m, h: [[m, m], [m, m], [s, s], [s, s]] };
    };
    Memory.market[res as ResourceConstant] = {
      v: 2,
      b: side(old.buy, old.buy95, old.buy99),
      s: side(old.sell, old.sell95, old.sell99),
      due: Game.time + _.random(0, kRefresh + kFuzz),
      hdue: Game.time + _.random(0, Math.round(3600000 / 4000)),
    };
  }
}

// The 2020 field names for the one dead reader left (struct.terminal.ts):
// now, mid and slow of each side in milli-credits.
export function legacyInfo(res: ResourceConstant): { buy?: number, buy95?: number, buy99?: number, sell?: number, sell95?: number, sell99?: number } | undefined {
  const m = Memory.market[res];
  if (!m) return undefined;
  return {
    buy: m.b.now, buy95: m.b.mid, buy99: slowOf(m.b),
    sell: m.s.now, sell95: m.s.mid, sell99: slowOf(m.s),
  };
}

// --- the daemon --------------------------------------------------------------

// Refreshes the resources nobody asked about: every tick the two records
// furthest past their deadline (+ kOverdue), oldest first, so a backlog after
// a global reset drains smoothly instead of in one burst. Every kDiscover
// ticks the whole book is read once for resources with no record yet.
@daemon
class MarketTracker extends Process {
  bucket = 3000;
  private refreshed = 0;
  private lastCpu = 0;
  private known = 0;

  run(): Priority {
    if (marketDisabled()) return "late";
    const cpu = Game.cpu.getUsed();
    const overdue: [number, ResourceConstant][] = [];
    const limit = Game.time - kOverdue;
    for (const res in Memory.market) {
      const m = Memory.market[res as ResourceConstant]!;
      if (m.due <= limit) overdue.push([m.due, res as ResourceConstant]);
    }
    overdue.sort((a, b) => a[0] - b[0]);
    for (const [, res] of overdue.slice(0, kPerTick)) {
      refresh(res);
      this.refreshed++;
    }
    if (Game.time % kDiscover === 7) this.discover();
    this.lastCpu = Game.cpu.getUsed() - cpu;
    return "late";
  }

  discover() {
    const traded = _.uniq(getAllOrders().map(o => o.resourceType as ResourceConstant));
    for (const res of traded) {
      if (_.contains(kSkip, res)) continue;
      infoOf(res);
    }
    this.known = _.size(Memory.market);
  }

  status(): string {
    return `${super.status()} tracking ${this.known || _.size(Memory.market)} resources, ` +
      `${this.refreshed} daemon refreshes since reset, alpha 1:${(1 / midAlpha()).toFixed(1)}, ` +
      `${ticksPerHour()} ticks/hour, last tick ${this.lastCpu.toFixed(2)} CPU`;
  }
}

// --- console -----------------------------------------------------------------

const fmt = (v?: number) => v === undefined ? "-" : (v / 1000).toFixed(v >= 100000 ? 0 : 2);

// market() prints every tracked resource: bid now/mid/slow, ask now/mid/slow
// (credits) and the refresh state; market("H") adds the history slots.
export function table(res?: string): string {
  if (res) {
    const m = Memory.market[res as ResourceConstant];
    if (!m) return `${res}: not tracked`;
    const side = (name: string, t: SideTrack) =>
      `${name}: now ${fmt(t.now)} mid ${fmt(t.mid)} slow ${fmt(slowOf(t))}` +
      `  h1 [${(t.h?.[0] || []).map(fmt).join(" ")}] h2 [${(t.h?.[1] || []).map(fmt).join(" ")}]` +
      ` h4 [${(t.h?.[2] || []).map(fmt).join(" ")}] h8 [${(t.h?.[3] || []).map(fmt).join(" ")}]`;
    return [`${res}${isSuspect(res) ? " SUSPECT" : ""} due in ${m.due - Game.time} hist in ${m.hdue - Game.time} depth ${depthFor(res)}`,
      side("bid", m.b), side("ask", m.s)].join("\n");
  }
  const rows = Object.keys(Memory.market).sort().map(r => {
    const m = Memory.market[r as ResourceConstant]!;
    return `${r.padEnd(14)} bid ${fmt(m.b.now).padStart(9)} ${fmt(m.b.mid).padStart(9)} ${fmt(slowOf(m.b)).padStart(9)}` +
      `  ask ${fmt(m.s.now).padStart(9)} ${fmt(m.s.mid).padStart(9)} ${fmt(slowOf(m.s)).padStart(9)}` +
      `  due ${String(m.due - Game.time).padStart(5)}${isSuspect(r) ? " SUSPECT" : ""}`;
  });
  return [`${"resource".padEnd(14)} ${"bid now".padStart(13)} ${"mid".padStart(9)} ${"slow".padStart(9)}  ${"ask now".padStart(13)} ${"mid".padStart(9)} ${"slow".padStart(9)}`]
    .concat(rows).join("\n");
}
