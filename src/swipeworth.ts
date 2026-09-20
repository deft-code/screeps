import { bidUnits, tryGetBuyOrderPrice, tryGetSellOrderPrice } from "market";
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

// Nobody will buy it: the buy-order price is negative, which is how
// tryGetBuyOrderPrice says "no price", and not one unit is bid for. The second
// test is there because "no price" alone also covers a thin book (under 10k
// units bid for), and what this verdict leads to is throwing the stuff away.
// Never energy, never where there is no market, and never while energy itself
// has no buy price: that means the order book cannot be read this tick, not
// that everything we own is junk.
export function worthless(res: ResourceConstant): boolean {
    if (res === RESOURCE_ENERGY || marketDisabled()) return false;
    if (!(tryGetBuyOrderPrice(RESOURCE_ENERGY) > 0)) return false;
    return tryGetBuyOrderPrice(res) < 0 && bidUnits(res) <= 0;
}

// The worthless resources in a store.
export function worthlessIn(store: StoreDefinition | Store<ResourceConstant, false>): ResourceConstant[] {
    const s = store as unknown as { [res: string]: number };
    return (Object.keys(s) as ResourceConstant[]).filter(res => s[res] > 0 && worthless(res));
}

export function swipeWorth(home?: string): Worth {
    return res => worthSwiping(res, home);
}
