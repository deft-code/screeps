import { bidUnits, buyOrderPriceEma, tryGetBuyOrderPrice, tryGetSellOrderPrice } from "market";
import { marketDisabled } from "markethack";

// What is worth carrying home from a looted room; shared by the Swipe mission
// (ms.swipe.ts, job.swiper.ts) and Furiosa's swipe (powercreep.ts).
//
// The base cost of a trip is taken to be energy, priced at what buying it
// costs delivered to the home room (market.getSellOrderPrice(energy, home):
// effective price, shipping included). A resource is picked up only when
// selling it pays (market.getBuyOrderPrice) at least kWorthFactor times that.
// Energy itself is always worth it. A resource the market cannot price (under
// 10k units bid for) is not; when energy cannot be priced, or the shard has no
// market at all (season), everything is.
const kWorthFactor = 2;

// Says which resources are worth taking.
export type Worth = (res: ResourceConstant) => boolean;
export const anything: Worth = () => true;

// Credits per unit a resource must sell for; 0 when there is no telling.
export function minSwipePrice(home?: string): number {
    if (marketDisabled()) return 0;
    const energy = tryGetSellOrderPrice(RESOURCE_ENERGY, home);
    return energy === Infinity ? 0 : kWorthFactor * energy;
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
        ok = min <= 0 || tryGetBuyOrderPrice(res) >= min;
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
// catalyzed boosts. Those stay for now even when nobody bids for them: they
// are the labs' end product and a thin book says little about their use to us.
export function junkIn(store: StoreDefinition | Store<ResourceConstant, false>): ResourceConstant[] {
    return worthlessIn(store).filter(res => !catalyzed(res));
}

// What a unit of `res` sells for (the buy-order price), for ranking loot; 0
// when it has no price this tick or there is no market.
export function unitValue(res: ResourceConstant): number {
    if (marketDisabled()) return 0;
    return Math.max(0, tryGetBuyOrderPrice(res));
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
