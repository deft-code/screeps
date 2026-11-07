// The market's console-editable state, Memory.marketcfg: stock-rule
// overrides, the manipulation suspects and the blacklist. A leaf module (no
// imports) so that the pricer (market.ts), the rules (stockrules.ts), the
// detector (marketwatch.ts) and the trader (ms.trader.ts) can all read it
// without a require cycle. Design: docs/market-design.md.

declare global {
    // A resource whose daily history looks pumped (marketwatch.ts). While it
    // is listed the tracker freezes its averages and the trader never buys it.
    interface MarketSuspect {
        // Date.now() of the detection.
        since: number
        // The clean price and daily transaction count the detection measured
        // against (lower quartiles of the 14-day history), in credits. Kept
        // because a long pump drags the history's own median up with it.
        base: number
        txBase: number
        why: string
        // Outlier orders seen while watching: how many, the ticks they
        // lived summed up, and how many per room.
        seen?: number
        lifeSum?: number
        rooms?: { [roomName: string]: number }
    }

    interface MarketCfg {
        // Partial StockRule per resource, merged over the hardcoded table.
        rules?: { [res: string]: { [field: string]: number } }
        suspects?: { [res: string]: MarketSuspect }
        // player -> resource -> expiry (Date.now() ms).
        blacklist?: { [player: string]: { [res: string]: number } }
        // resource -> room -> expiry: what the pricer checks. Filled from the
        // blacklist by marketwatch.ts as it learns who owns which room, and
        // directly for a room whose owner is not known yet.
        blocked?: { [res: string]: { [roomName: string]: number } }
    }

    interface Memory {
        marketcfg: MarketCfg
    }
}

if (!Memory.marketcfg) Memory.marketcfg = {};

export function cfg(): MarketCfg {
    return Memory.marketcfg = Memory.marketcfg || {};
}

let nowTick = -1;
let nowMs = 0;
// Date.now(), read once a tick.
export function wallClock(): number {
    if (nowTick !== Game.time) {
        nowTick = Game.time;
        nowMs = Date.now();
    }
    return nowMs;
}

export function isSuspect(res: string): boolean {
    const suspects = Memory.marketcfg && Memory.marketcfg.suspects;
    return !!suspects && !!suspects[res];
}

// Is an order of `res` from `roomName` to be ignored (its owner is
// blacklisted on that resource)? Orders without a room never are.
export function isBlocked(res: string, roomName: string | undefined): boolean {
    if (!roomName) return false;
    const blocked = Memory.marketcfg && Memory.marketcfg.blocked;
    const rooms = blocked && blocked[res];
    if (!rooms) return false;
    const expiry = rooms[roomName];
    return expiry !== undefined && expiry > wallClock();
}

// Does `res` have any live blocked room? Lets the pricer skip the per-order
// check for the ~all resources nobody is blacklisted on.
export function hasBlocked(res: string): boolean {
    const blocked = Memory.marketcfg && Memory.marketcfg.blocked;
    return !!blocked && !!blocked[res] && !_.isEmpty(blocked[res]);
}
