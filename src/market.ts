import * as debug from 'debug';
import * as k from 'constants';
import { theTick } from 'cache';
import { depositDist } from 'deposit';
import { theRadar } from 'radar';

declare global {
  interface MarketInfo {
    buy: number
    buy95: number
    buy99: number
    buy9500?: number
    buy9900?: number

    sell: number
    sell95: number
    sell99: number
    sell9500?: number
    sell9900?: number
  }

  interface Memory {
    market: Record<ResourceConstant, MarketInfo>
  }
}


if (!Memory.market) {
  Memory.market = {} as Record<ResourceConstant, MarketInfo>;
}

type MarketStore = Record<ResourceConstant, number>;

interface RoomInfo {
  terminal: StructureTerminal
  store: MarketStore
}

interface MarketTickCache {
  rooms?: Record<string, RoomInfo>
  global: MarketStore
}

function addStore(store: MarketStore, sum: MarketStore) {
  for (let rec in store) {
    const r = rec as ResourceConstant
    const n = store[r];
    if (!n) {
      debug.log("broken store", JSON.stringify(store));
    }

    if (!sum[r]) {
      sum[r] = n;
    } else {
      sum[r] += n;
    }
  }
}

function scanRoom(room: Room): RoomInfo | null {
  if (!(room.controller?.level! >= 6)) return null;

  const terminal = room.terminal;
  if (!terminal) return null;
  const info = {
    terminal,
    store: {}
  } as RoomInfo

  const sum = {} as MarketStore;
  const stores = room.findStructs(STRUCTURE_TERMINAL, STRUCTURE_STORAGE, STRUCTURE_FACTORY) as GeneralStoreStruct[];
  for (const store of stores) {
    addStore(store.store, info.store);
  }
  return info;
}

export class Market {
  id = 'market';
  tick: MarketTickCache;
  registerRoom(room: Room) {
    if (!this.tick.rooms) {
      this.tick.rooms = {};
    }

    const info = this.tick.rooms[room.name] || scanRoom(room);
    if (!info) return;

    this.tick.rooms[room.name] = info;

    if (!this.tick.global) {
      this.tick.global = {} as MarketStore;
    }

    addStore(info.store, this.tick.global);
  }

  run() {
  }

}
theTick.inject(Market);

export const theMarket = new Market();


export function HistoryMean() {
  const allHists = Game.market.getHistory();
  const histsRec = _.groupBy(allHists, h => h.resourceType);
  for (const r in histsRec) {
    const hists = histsRec[r];
    if (hists.length > 10) {
      const fewest = _.min(hists, h => h.transactions);
      _.remove(hists, h => h.date === fewest.date);
    }
    if (hists.length > 9) {
      const smallest = _.min(hists, h => h.volume);
      _.remove(hists, h => h.date === smallest.date);
    }

    console.log("Rec", r, histsRec[r].length);
  }
}

export function run() {
  const r = k.CoreMinerals[Game.time % k.CoreMinerals.length]
  recordResource(r);
}

function recordResource(r: ResourceConstant) {
  const buys = _.filter(
    Game.market.getAllOrders({ resourceType: r }),
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

  const m = Memory.market[r]!

  if (bPrice > 0) {
    m.buy = bPrice

    if (!m.buy9500) m.buy9500 = m.buy95 * 100;
    m.buy9500 = Math.round((m.buy9500 * 19 + bPrice * 100) / 20);
    m.buy95 = Math.round(m.buy9500 / 100);

    if (!m.buy9900) m.buy9900 = m.buy99 * 100;
    m.buy9900 = Math.round((m.buy9900 * 99 + bPrice * 100) / 100);
    m.buy99 = Math.round(m.buy9900 / 100);
  } else {
    debug.log('Too Few buy offers', r)
  }

  if (sPrice > 0) {
    m.sell = sPrice

    if (!m.sell9500) m.sell9500 = m.sell95 * 100;
    m.sell9500 = Math.round((m.sell9500 * 19 + sPrice * 100) / 20);
    m.sell95 = Math.round(m.sell9500 / 100);

    if (!m.sell9900) m.sell9900 = m.sell99 * 100;
    m.sell9900 = Math.round((m.sell9900 * 99 + sPrice * 100) / 100);
    m.sell99 = Math.round(m.sell9900 / 100);
  } else {
    debug.log('Too Few sell offers', r)
  }
}

function sumFirst(orders: Order[], n = 10000) {
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
