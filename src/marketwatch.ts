import * as debug from "debug";
import { daemon, Priority, Process } from "process";
import { getAllOrders, marketDisabled } from "markethack";
import { cfg, wallClock } from "marketcfg";
import { resetTrack, ticksPerHour } from "market";
import { RoomIntel } from "intel";
import { theRadar } from "radar";

// Market manipulation detector, the passive half (docs/market-design.md):
//
// 1. Suspects. Once every kHistoryHours per tracked resource, one resource a
//    tick, the daily market history is read. A resource becomes a suspect
//    when either of its last two days has an average price over kPriceX
//    times the clean price AND more transactions than kTxX times the clean
//    count (and at least kTxMin): a wash trade is many small self-deals, so
//    the count explodes while the lots shrink, which is what told the four
//    pumped tier-3 boosts of Nov 2026 apart from honest noise; the standard
//    deviation alone did not (H, L and energy are noisy every day, a clean
//    wash has none). Clean = the lower quartile of the 14 days, stored with
//    the suspect because a long pump drags the median up with it; a suspect
//    is cleared when its last three days are all back under kPriceX of that.
//    While suspect: market.ts freezes the averages, the trader never buys.
//
// 2. Watching suspects. Every tick, each suspect's book is read and the
//    outlier orders (a bid over kPriceX times the clean price, an ask under
//    1/kPriceX of it) are followed by id: how long they live and which rooms
//    post them, kept in the suspect record. That is the raw material for the
//    probing half (later): the orders a one-unit deal would test.
//
// 3. Blacklist. Memory.marketcfg.blacklist[player][res] = expiry (8 days).
//    Entries are made by hand for now (blacklist("Taki", "XKH2O")); the
//    probing half will make them. Every kResolveTicks the rooms in each
//    blacklisted resource's book are matched to owners through intel; rooms
//    of the player go into Memory.marketcfg.blocked[res], which the pricer
//    checks per order; rooms intel has never seen are asked of the radar
//    (observeMax reaches any room). Adding an entry also resets the
//    resource's averages so they re-seed from the cleaned book.

const kHistoryHours = 3;
const kPriceX = 1.5;
const kTxX = 5;
const kTxMin = 50;
const kMinDays = 6;
const kBlacklistDays = 8;
const kDay = 86400000;
const kResolveTicks = 50;
const kRadarPerPass = 3;
// Most outlier orders followed per suspect.
const kMaxFollowed = 60;

interface Followed {
    room: string
    price: number
    type: string
    first: number
    last: number
}

const nextHistory = new Map<string, number>();
const followed = new Map<string, Map<string, Followed>>();

function suspects(): { [res: string]: MarketSuspect } {
    const c = cfg();
    return c.suspects = c.suspects || {};
}

function quartile(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 4)];
}

// Read one resource's daily history and set or clear its suspect flag.
function checkHistory(res: ResourceConstant) {
    const days = _.sortBy(Game.market.getHistory(res) as PriceHistory[], d => d.date);
    if (days.length < kMinDays) return;
    const all = suspects();
    const current = all[res];
    const base = current ? current.base : quartile(days.map(d => d.avgPrice));
    const txBase = current ? current.txBase : Math.max(1, quartile(days.map(d => d.transactions)));
    const pumped = (d: PriceHistory) => d.avgPrice > kPriceX * base && d.transactions > Math.max(kTxX * txBase, kTxMin);
    const recent = days.slice(-2);
    if (!current) {
        const hit = _.find(recent, pumped);
        if (hit) {
            all[res] = {
                since: wallClock(), base, txBase,
                why: `${hit.date}: avg ${Math.round(hit.avgPrice)} vs clean ${Math.round(base)}, ${hit.transactions} tx vs ${txBase}`,
            };
            debug.log("marketwatch: SUSPECT", res, all[res].why);
        }
        return;
    }
    const last3 = days.slice(-3);
    if (last3.length === 3 && _.every(last3, d => d.avgPrice <= kPriceX * base)) {
        debug.log("marketwatch: cleared", res, "after", last3.map(d => `${d.date} ${Math.round(d.avgPrice)}`).join(", "));
        delete all[res];
        followed.delete(res);
    }
}

// Follow the outlier orders of one suspect this tick.
function watch(res: string, info: MarketSuspect) {
    const orders = getAllOrders({ resourceType: res as ResourceConstant });
    let seen = followed.get(res);
    if (!seen) followed.set(res, seen = new Map());
    const live = new Set<string>();
    for (const o of orders) {
        if (Game.market.orders[o.id] || !o.roomName) continue;
        const outlier = o.type === ORDER_BUY ? o.price > kPriceX * info.base : o.price < info.base / kPriceX;
        if (!outlier) continue;
        live.add(o.id);
        const f = seen.get(o.id);
        if (f) {
            f.last = Game.time;
            continue;
        }
        if (seen.size >= kMaxFollowed) continue;
        seen.set(o.id, { room: o.roomName, price: o.price, type: o.type, first: Game.time, last: Game.time });
        info.seen = (info.seen || 0) + 1;
        info.rooms = info.rooms || {};
        info.rooms[o.roomName] = (info.rooms[o.roomName] || 0) + 1;
        debug.log("marketwatch: outlier", res, o.type, o.price, "x", o.remainingAmount, "from", o.roomName, "clean", Math.round(info.base));
    }
    for (const [id, f] of seen) {
        if (live.has(id)) continue;
        info.lifeSum = (info.lifeSum || 0) + (f.last - f.first + 1);
        seen.delete(id);
    }
}

// Rooms of a blacklisted resource's book: mark the player's, ask the radar
// about the unknown.
function resolveBlacklist() {
    const c = cfg();
    const now = wallClock();
    const blacklist = c.blacklist || {};
    const blocked = c.blocked = c.blocked || {};
    // Expired entries go, blocked rooms with them.
    for (const player in blacklist) {
        for (const res in blacklist[player]) {
            if (blacklist[player][res] <= now) delete blacklist[player][res];
        }
        if (_.isEmpty(blacklist[player])) delete blacklist[player];
    }
    for (const res in blocked) {
        for (const room in blocked[res]) {
            if (blocked[res][room] <= now) delete blocked[res][room];
        }
        if (_.isEmpty(blocked[res])) delete blocked[res];
    }
    const byRes: { [res: string]: { [player: string]: number } } = {};
    for (const player in blacklist) {
        for (const res in blacklist[player]) {
            (byRes[res] = byRes[res] || {})[player] = blacklist[player][res];
        }
    }
    let asked = 0;
    for (const res in byRes) {
        const rooms = _.uniq(getAllOrders({ resourceType: res as ResourceConstant }).map(o => o.roomName).filter(r => !!r)) as string[];
        for (const room of rooms) {
            const owner = RoomIntel.get(room)?.owner;
            if (owner === null || owner === undefined) {
                if (asked < kRadarPerPass && !RoomIntel.get(room)) {
                    theRadar.observeBackground(room);
                    asked++;
                }
                continue;
            }
            const expiry = byRes[res][owner];
            if (expiry) (blocked[res] = blocked[res] || {})[room] = expiry;
        }
    }
}

@daemon
class MarketWatch extends Process {
    bucket = 3000;
    private checks = 0;

    run(): Priority {
        if (marketDisabled()) return "late";
        if (resolvePending) {
            resolvePending = false;
            // Blocked rooms are rebuilt from scratch so a cleared entry's rooms go.
            cfg().blocked = {};
            resolveBlacklist();
        }
        this.checkOne();
        const all = suspects();
        for (const res in all) watch(res, all[res]);
        if (Game.time % kResolveTicks === 3) resolveBlacklist();
        return "late";
    }

    // The one tracked resource whose history check is longest overdue.
    checkOne() {
        const every = ticksPerHour() * kHistoryHours;
        let pick: string | undefined;
        let pickAt = Infinity;
        for (const res in Memory.market) {
            let at = nextHistory.get(res);
            if (at === undefined) {
                // Stagger the first round over a full interval.
                at = Game.time + _.random(0, every);
                nextHistory.set(res, at);
            }
            if (at <= Game.time && at < pickAt) {
                pick = res;
                pickAt = at;
            }
        }
        if (!pick) return;
        nextHistory.set(pick, Game.time + every);
        this.checks++;
        checkHistory(pick as ResourceConstant);
    }

    status(): string {
        const all = suspects();
        const names = Object.keys(all);
        return `${super.status()} ${this.checks} history checks since reset, suspects: ${names.length ? names.join(" ") : "none"}, ` +
            `blacklist: ${_.size(cfg().blacklist || {})} players, blocked rooms on ${_.size(cfg().blocked || {})} resources`;
    }
}

// --- console -----------------------------------------------------------------

// blacklist() lists; blacklist("Taki", "XKH2O"[, days]) adds or extends;
// blacklist("Taki", null) clears the player; blacklist("Taki", "XKH2O", 0) clears one.
export function blacklist(player?: string, res?: string | null, days = kBlacklistDays): string {
    const c = cfg();
    const list = c.blacklist = c.blacklist || {};
    if (player && res === null) {
        delete list[player];
        resolveLater();
        return `cleared ${player}`;
    }
    if (player && res) {
        if (days <= 0) {
            if (list[player]) delete list[player][res];
            if (list[player] && _.isEmpty(list[player])) delete list[player];
            if (c.blocked && c.blocked[res]) delete c.blocked[res];
            return `cleared ${player} on ${res}`;
        }
        (list[player] = list[player] || {})[res] = wallClock() + days * kDay;
        resetTrack(res as ResourceConstant);
        resolveLater();
        return `${player} blacklisted on ${res} for ${days} days; ${res} averages reset`;
    }
    const now = wallClock();
    const lines: string[] = [];
    for (const p in list) {
        for (const r in list[p]) {
            const rooms = Object.keys((c.blocked || {})[r] || {});
            lines.push(`${p} ${r}: ${((list[p][r] - now) / kDay).toFixed(1)} days left, rooms ${rooms.length ? rooms.join(" ") : "none resolved yet"}`);
        }
    }
    return lines.length ? lines.join("\n") : "blacklist empty";
}

// Set by the console helpers; the daemon's next tick rebuilds the blocked rooms.
let resolvePending = false;
function resolveLater() {
    resolvePending = true;
}

// suspects() lists the suspects with their evidence and what the watch saw.
export function listSuspects(): string {
    const all = suspects();
    const lines = Object.keys(all).map(res => {
        const s = all[res];
        const life = s.seen && s.lifeSum ? ` avg life ${(s.lifeSum / s.seen).toFixed(0)} ticks` : "";
        const rooms = s.rooms ? Object.keys(s.rooms).sort((a, b) => s.rooms![b] - s.rooms![a]).slice(0, 6).map(r => `${r} x${s.rooms![r]}`).join(", ") : "";
        return `${res}: since ${((wallClock() - s.since) / 3600000).toFixed(1)} h, ${s.why}; outliers seen ${s.seen || 0}${life}${rooms ? "; rooms " + rooms : ""}`;
    });
    return lines.length ? lines.join("\n") : "no suspects";
}
