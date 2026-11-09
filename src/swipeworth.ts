import { bidUnits, buyOrderPriceEma, energyValue, tryGetBuyOrderPrice } from "market";
import { marketDisabled } from "markethack";
import { classOf, ruledResources } from "stockrules";

// What is worth carrying home from a looted room; shared by the Swipe mission
// (ms.swipe.ts, job.swiper.ts) and Furiosa's swipe (powercreep.ts).
//
// The base cost of a trip is taken to be energy, priced as the trader prices
// it (market.energyValue: the bid-side slow average, scaled down as the home
// storage fills past half). A resource is picked up only when selling it pays
// (market.getBuyOrderPrice) at least kWorthFactor times that. Energy itself
// is always worth it. A resource the market cannot price (under 10k units bid
// for) is not; when energy cannot be priced, or the shard has no market at all
// (season), everything is. Until 7 Nov 2026 energy was priced at the ask
// delivered to the home room, which far orders' transfer energy inflated to
// ~4x the bid and put K and H (310k and 43k units in W6N2) under the bar.
const kWorthFactor = 2;

// Says which resources are worth taking.
export type Worth = (res: ResourceConstant) => boolean;
export const anything: Worth = () => true;

// Credits per unit a resource must sell for; 0 when there is no telling.
export function minSwipePrice(home?: string): number {
    if (marketDisabled()) return 0;
    const energy = energyValue(home ? Game.rooms[home] : undefined);
    return energy > 0 ? kWorthFactor * energy : 0;
}

// Verdicts of this tick by home room and resource; the prices behind them are
// per tick too.
let memoTick = -1;
let memo = new Map<string, boolean>();

export function worthSwiping(res: ResourceConstant, home?: string): boolean {
    if (res === RESOURCE_ENERGY) return true;
    if (memoTick !== Game.time) {
        memoTick = Game.time;
        memo = new Map();
    }
    const key = (home || "") + res;
    let ok = memo.get(key);
    if (ok === undefined) {
        const min = minSwipePrice(home);
        // The live price when the book is deep enough, else the same
        // valuation the ranking uses (unitValue: average, then history), so a
        // thin book or a junk-polluted average does not make real loot
        // worthless (XZH2O's 10k units in W6N2 were, 7 Nov 2026).
        const live = tryGetBuyOrderPrice(res);
        ok = min <= 0 || (live > 0 ? live : unitValue(res)) >= min;
        memo.set(key, ok);
    }
    return ok;
}

// Not worth keeping: its buy-order price, as the short moving average
// (market.buyOrderPriceEma), is under energy's. With a thin book (under 10k
// units bid, so no price this tick) the test is instead that nobody bids
// energy's price or better for any of it. What this verdict leads to is
// throwing the stuff away, hence: never energy, never where there is no
// market, and never while energy itself has no average (the order book cannot
// be read; that does not make everything we own junk).
export function worthless(res: ResourceConstant): boolean {
    if (res === RESOURCE_ENERGY || marketDisabled()) return false;
    const energy = buyOrderPriceEma(RESOURCE_ENERGY);
    if (!(energy > 0)) return false;
    // Priced this tick: judge by the moving average, not by one tick's book.
    if (tryGetBuyOrderPrice(res) > 0) return buyOrderPriceEma(res) < energy;
    // Thin book (under 10k units bid): junk unless somebody bids at least
    // energy's price for some of it. A 0.001 bid does not make it worth keeping.
    return bidUnits(res, energy) <= 0;
}

// The worthless resources in a store.
export function worthlessIn(store: StoreDefinition | Store<ResourceConstant, false>): ResourceConstant[] {
    const s = store as unknown as { [res: string]: number };
    return (Object.keys(s) as ResourceConstant[]).filter(res => s[res] > 0 && worthless(res));
}

// The catalyzed (tier 3) boosts: XUH2O and friends, not the catalyst X itself.
export function catalyzed(res: ResourceConstant): boolean {
    return res.length > 1 && res[0] === RESOURCE_CATALYST;
}

// What a Konmari may throw away out of a store: the worthless, except the
// catalyzed boosts and anything the stock rules cover (stockrules.ts: base
// minerals, ghodium, tier-3 boosts, factory products). The boosts stay even
// when nobody bids for them: they are the labs' end product and a thin book
// says little about their use to us. The ruled resources are the trader's:
// it buys them to their `want` and sells the surplus, and a Konmari laid to
// drop 8,545 O and 5,000 U the trader had just bought (W3N4, 7 Nov 2026) was
// cancelled on the spawn. A resource with a stock-rule class counts as ruled
// even while its rule is rejected, so a rule that fails validation (a bad
// console override) never turns stock into junk.
export function junkIn(store: StoreDefinition | Store<ResourceConstant, false>): ResourceConstant[] {
    const ruled = ruledResources();
    return worthlessIn(store).filter(res => !catalyzed(res) && classOf(res) === "other" && !_.contains(ruled, res));
}

// The market history's latest daily average price by resource, asked again
// every kHistoryTTL ticks (heap; Game.market.getHistory costs ~0.05 CPU a
// resource).
const kHistoryTTL = 1000;
const history = new Map<string, [number, number]>();

function historyPrice(res: ResourceConstant): number {
    const hit = history.get(res);
    if (hit && Game.time - hit[0] < kHistoryTTL) return hit[1];
    const day = _.last(Game.market.getHistory(res) as PriceHistory[]);
    const avg = day ? day.avgPrice : 0;
    history.set(res, [Game.time, avg]);
    return avg;
}

// What a unit of `res` is worth, for ranking loot: the best of the buy-order
// price this tick (none with a thin book), its moving average
// (market.buyOrderPriceEma) and the market history's latest daily average.
// The rarest loot has the thinnest book: a stronghold's muscle, tissue and
// phlegm (1.5M, 625k and 32k credits a unit) ranked 0, behind composite,
// until 6 Nov 2026; and an average dragged down by junk bids (XZH2O's 72
// against real bids of 1,700 and a daily average of 1,500) ranked real loot
// as junk until the best of the three was taken (7 Nov 2026). 0 when
// nothing prices it or there is no market.
export function unitValue(res: ResourceConstant): number {
    // No resource (an empty store's first): getHistory() without one
    // answers every resource's history.
    if (!res || marketDisabled()) return 0;
    const live = tryGetBuyOrderPrice(res);
    const ema = buyOrderPriceEma(res);
    return Math.max(0, live > 0 ? live : 0, ema > 0 ? ema : 0, historyPrice(res));
}

// The resources of a store that are `worth` taking, most valuable first.
export function byValue(store: StoreDefinition | Store<ResourceConstant, false>, worth: Worth = anything): ResourceConstant[] {
    const s = store as unknown as { [res: string]: number };
    const held = (Object.keys(s) as ResourceConstant[]).filter(res => s[res] > 0 && worth(res));
    return _.sortBy(held, res => -unitValue(res));
}

export function swipeWorth(home?: string): Worth {
    return res => worthSwiping(res, home);
}
