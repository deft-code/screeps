import * as debug from "debug";
import { Priority, register, Service } from "process";
import { getAllOrders, getOrderById, marketDisabled } from "markethack";
import { isSuspect } from "marketcfg";
import { RoomIntel } from "intel";
import { Band, BandInfo, bandOf, bandStr, roomStock, ruleFor, ruledResources, StockRule } from "stockrules";
import { energyValue, oldestOf, slowOf, trackOf, transferRate, tryGetBuyOrderPrice, tryGetSellOrderPrice } from "market";

// The trader (docs/market-design.md, section 8: bands). Every tick it looks at
// a few ruled resources (kPerTick, round robin), and for each paper variant
// and each room with a terminal works out the trades the band the room's
// stock is in allows; when a variant's paper terminal is off its cooldown it
// "fills" the best candidate and books it in that variant's ledger
// (Memory.trader.sim[name]): virtual stock per resource, cash, the transfer
// energy burned, the quantity taken from each order (so the same order is
// not filled twice while it still shows in the book), and the last kFills
// fills. traderReport() prints the ledgers.
//
//   scheduleService('Trader')
//   getService('Trader').live('vg15', 1.2e9)   // deal for real on that variant's candidates
//   getService('Trader').live(null)            // back to paper only
//   getService('Trader').status()              // per room and resource: stock, band, multipliers, cap/floor, candidate or why none
//
// One price path (the band curve on the same-side fair prices): fair buy =
// min(ask mid, ask slow), fair sell = max(bid mid, bid slow). The band
// (stockrules.ts bandOf) gives a buy multiplier and a sell multiplier, either
// closed; buy cap = buyMult x fair buy (and <= the rule's ceil), sell floor =
// sellMult x fair sell (and >= the rule's floor). The variants differ only in
// the "very good" margin of the band table:
//
//   vg15   0.85 / 1.15
//   vg10   0.90 / 1.10
//
// The surcharge test guards buys only (9 Nov 2026; it used to veto both
// sides, which stopped every clearance sell while the book had a spread,
// since fair sell sits under fair buy in a quiet market): in the goodbuy,
// arb and clear bands an ask is taken only if the unit could be sold back at
// fair sell without a loss, so the buy cap is also fair sell minus the round
// trip's transfer energy at energy's value (no fair sell: no such cap). A
// sell needs nothing beyond its floor: the unit is already ours. need, glut
// and liquidate deal on their cap or floor alone. Always: a suspect resource (marketcfg) is never
// bought, no ask over kAskOverBid x the best real bid is taken, and
// liquidate sells into the best real bid (>= kRealBid credits) whatever it is.
//
// Quantity: at most the rule's chunk, the order's remaining amount, and what
// moves the stock to the current band's edge in the trade's direction: a buy
// up to the band's upper boundary, a sell down to its lower boundary. The
// next deal is judged again in whatever band the stock is then in.
//
// Ranking per room: need buys and liquidate sells first, then by delta
// (credits a unit between the order's effective price and the cap or floor
// it beats). Prices are effective: an ask costs its price plus our transfer
// energy, a bid pays its price minus it, energy valued at market.energyValue
// (its bid-side slow scaled down by the storage's fill past half).
//
// Live (Memory.trader.live): one variant's candidates, computed on the
// room's real stock (no dry-run `start`), are dealt with Game.market.deal,
// one per room per tick when its terminal is off cooldown, holds the goods
// (sell) or the room (buy) and the transfer energy, and the buy would not
// take the credits under the floor. A deal is booked only the next tick,
// when it shows in Game.market.incoming/outgoingTransactions with the order's
// id (the engine fills the nearest dealer first and skips the rest silently);
// a missing one counts as failed. The transaction names the counterparty, and
// every deal with a player on kWatchPlayers (the ones seen behind the
// manipulation of Nov 2026) is recorded in Memory.trader.live.watch
// (traderWatch()). The break: the moment Game.market.credits is under the
// floor the live trader halts (no deals of either side), logs, notifies, and
// stays halted until resume().
//
// The emergency energy sell order (only while live trading is on): a room
// whose storage holds over kEmergencyFill of its capacity and over
// kEmergencyEnergy energy (storage + terminal) keeps one own sell order of
// kEmergencyAmount energy from its terminal, priced kEmergencyUnder x the
// lowest foreign energy ask but never under kEmergencyFloor x energy's
// bid-side slow (or x the best real bid while slow is unknown; neither = no
// order), topped back up with extendOrder while the
// condition holds, repriced (changeOrderPrice, again under the lowest other
// ask) when it is no longer the lowest ask and its price is kRepriceAge ticks
// old, cancelled only once empty with the condition gone. Order ids by room
// in Memory.trader.eorders. Fees (MARKET_FEE on create and extend) are never
// paid out of the credits under the live floor.

const kVariants = { vg15: 0.15, vg10: 0.10 };
type Variant = keyof typeof kVariants;
const kVariantNames = Object.keys(kVariants) as Variant[];
// Players whose deals with us are recorded (traderWatch()).
const kWatchPlayers = ["Taki", "qnz"];
// Watch events kept.
const kWatch = 200;
// Default credits floor for live trading.
const kDefaultFloor = 1.2e9;

// Resources examined per tick.
const kPerTick = 5;
// A candidate older than one evaluation cycle plus this is not used.
const kFreshSlack = 2;
// Paper terminal cooldown per deal.
const kCooldown = TERMINAL_COOLDOWN;
// Fills kept per ledger.
const kFills = 150;
// Typical transfer rate per leg for the surcharge.
const kTypicalRate = 0.75;
// No buy from an ask over this many times the best real bid (a pumped ask
// side sits far above anything a buyer pays); bids under kRealBid credits are
// junk and do not count.
const kAskOverBid = 2;
const kRealBid = 1;
// Default chunk when the rule has none.
const kChunk = 1000;
// Ticks between rebuilds of the ruled resource list.
const kRuledTicks = 50;
// The bands whose trades go before every other.
const kMandatory: Band[] = ["need", "liquidate"];
// The bands whose buys the surcharge test caps.
const kSurcharged: Band[] = ["goodbuy", "arb", "clear"];

// The emergency energy sell order (docs/market-design.md section 8).
const kEmergencyFill = 0.9;
const kEmergencyEnergy = 100000;
const kEmergencyAmount = 10000;
const kEmergencyUnder = 0.9;
// Never priced under this times energy's bid-side slow (or the best real bid).
const kEmergencyFloor = 0.5;
const kRepriceAge = 100;
// Ticks between looks at the energy book for a reprice.
const kRepriceCheck = 10;
// Ticks to wait for a created order to show in Game.market.orders.
const kCreateWait = 10;

type Dir = "buy" | "sell";

interface Candidate {
    scn: Variant
    // A live candidate: real stock, dealt for real.
    live?: boolean
    room: string
    res: ResourceConstant
    kind: Band
    dir: Dir
    orderId: string
    orderRoom: string
    price: number       // credits, the order's
    eff: number         // credits, after transfer
    qty: number
    delta: number       // credits a unit of edge over the cap or floor
    tick: number
    why: string
}

// [tick, res, dir, band, orderId, orderRoom, price, qty, delta, room]
type Fill = [number, string, Dir, string, string, string, number, number, number, string];

interface Ledger {
    start: number
    cash: number
    energy: number
    deals: number
    // room -> tick the paper terminal is free again
    cool: { [room: string]: number }
    // room -> res -> net units (bought - sold)
    delta: { [room: string]: { [res: string]: number } }
    // res -> orderId -> units already taken
    consumed: { [res: string]: { [orderId: string]: number } }
    // res -> [bought, spent, sold, earned, deals]
    stats: { [res: string]: [number, number, number, number, number] }
    fills: Fill[]
}

interface Pending {
    tick: number
    room: string
    res: ResourceConstant
    dir: Dir
    kind: string
    orderId: string
    orderRoom: string
    price: number
    qty: number
    delta: number
}

// [tick, player, res, dir, qty, price, orderRoom, orderId, ok]
type WatchEvent = [number, string, string, Dir, number, number, string, string, boolean];

interface Live {
    // The live variant (named `scenario` since the four scenarios of 6 Nov 2026).
    scenario: string | null
    floor: number
    halted?: string
    pending: Pending[]
    failed: number
    ledger: Ledger
    watch: WatchEvent[]
}

// The emergency energy sell order of a room: its id once it shows in
// Game.market.orders, the tick it was created, the tick it was last repriced.
interface EnergyOrder {
    id?: string
    made: number
    priced?: number
}

declare global {
    interface Memory {
        trader?: {
            sim: { [name: string]: Ledger }
            live?: Live
            eorders?: { [room: string]: EnergyOrder }
        }
    }
}

interface SideView {
    now?: number
    mid?: number
    slow?: number
    oldest?: number
}

interface ResView {
    res: ResourceConstant
    rule: StockRule
    bid: SideView
    ask: SideView
    bids: Order[]   // best first, ours and blocked left out
    asks: Order[]
    suspect: boolean
}

// What one evaluation saw for a variant, room and resource (status()).
interface Seen {
    tick: number
    stock: number
    band: BandInfo
    cap?: number
    floor?: number
    notes: string[]
}

const credits = (milli?: number) => milli === undefined ? undefined : milli / 1000;
const fmt = (n?: number) => n === undefined ? "-" : n >= 100 ? n.toFixed(0) : n.toFixed(2);

function sideView(res: ResourceConstant, side: Dir): SideView {
    const t = trackOf(res, side);
    return { now: credits(t.now), mid: credits(t.mid), slow: credits(slowOf(t)), oldest: credits(oldestOf(t)) };
}

function effective(order: Order, dir: Dir, room: string, energy: number): number {
    const cost = order.roomName ? transferRate(room, order.roomName) * energy : 0;
    return dir === "buy" ? order.price + cost : order.price - cost;
}

function blankLedger(): Ledger {
    return { start: Game.time, cash: 0, energy: 0, deals: 0, cool: {}, delta: {}, consumed: {}, stats: {}, fills: [] };
}

function traderMem() {
    return Memory.trader = Memory.trader || { sim: {} };
}

function ledgers(): { [name: string]: Ledger } {
    const t = traderMem();
    for (const name of kVariantNames) t.sim[name] = t.sim[name] || blankLedger();
    return t.sim;
}

function liveState(): Live {
    const t = traderMem();
    return t.live = t.live || { scenario: null, floor: kDefaultFloor, pending: [], failed: 0, ledger: blankLedger(), watch: [] };
}

const isVariant = (name: string | null | undefined): name is Variant => !!name && kVariantNames.indexOf(name as Variant) >= 0;

// The bands replaced the four scenarios (fairA, fourState, fairB, fourGap) on
// 8 Nov 2026: their paper ledgers are dropped, and a live trader on one of
// them moves to vg15 with the same floor so live trading carries on.
function migrate() {
    const t = traderMem();
    const old = Object.keys(t.sim || {}).filter(k => !isVariant(k));
    if (old.length) {
        debug.log(`TRADER migrate: dropping the paper ledgers ${old.join(", ")} for ${kVariantNames.join(", ")}`);
        t.sim = {};
    }
    const live = t.live;
    if (live && live.scenario && !isVariant(live.scenario)) {
        const was = live.scenario;
        live.scenario = "vg15";
        debug.log(`TRADER migrate: live trading moved from ${was} to vg15, floor ${live.floor.toLocaleString()}`);
    }
}

@register
export class Trader extends Service {
    private cursor = 0;
    private candidates = new Map<string, Candidate>();
    private seen = new Map<string, Seen>();
    private lastCpu = 0;
    private evaluated = 0;
    private migrated = false;

    run(): Priority {
        if (marketDisabled()) {
            debug.log(this.name, "no market on", Game.shard.name, "- killing");
            this.kill();
            return "kill";
        }
        if (!this.migrated) {
            migrate();
            this.migrated = true;
        }
        const cpu = Game.cpu.getUsed();
        const rooms = _.filter(Game.rooms, r => !!r.terminal && r.terminal.my && !!r.controller && r.controller.my);
        if (rooms.length) {
            this.verifyPending();
            this.evaluateSome(rooms);
            this.fillDue(rooms);
            this.dealLive(rooms);
            this.energyOrders(rooms);
        }
        this.lastCpu = Game.cpu.getUsed() - cpu;
        return "low";
    }

    private ruled: ResourceConstant[] = [];
    private ruledTick = -1;

    // The ruled resources, recomputed every kRuledTicks (a console override
    // may add one).
    ruledNow(): ResourceConstant[] {
        if (Game.time - this.ruledTick >= kRuledTicks) {
            this.ruled = ruledResources() as ResourceConstant[];
            this.ruledTick = Game.time;
        }
        return this.ruled;
    }

    // Ticks a candidate stays usable: one pass over the ruled resources plus slack.
    fresh(): number {
        return Math.ceil(this.ruledNow().length / kPerTick) + kFreshSlack;
    }

    // Examine the next kPerTick ruled resources and refresh their candidates.
    evaluateSome(rooms: Room[]) {
        const all = this.ruledNow();
        if (!all.length) return;
        for (let i = 0; i < kPerTick; i++) {
            const res = all[this.cursor++ % all.length];
            this.evaluate(res, rooms);
        }
        this.cursor %= all.length;
    }

    evaluate(res: ResourceConstant, rooms: Room[]) {
        this.evaluated++;
        // Pricing both sides is what keeps the tracker's `now` current.
        tryGetBuyOrderPrice(res);
        tryGetSellOrderPrice(res);
        // Our own orders (the emergency energy order) are never dealt on.
        const orders = getAllOrders({ resourceType: res }).filter(o => !Game.market.orders[o.id] && o.amount > 0 && !!o.roomName);
        const view: ResView = {
            res, rule: ruleFor(res), suspect: isSuspect(res),
            bid: sideView(res, "buy"), ask: sideView(res, "sell"),
            bids: _.sortBy(orders.filter(o => o.type === ORDER_BUY), o => -o.price),
            asks: _.sortBy(orders.filter(o => o.type === ORDER_SELL), o => o.price),
        };
        const sims = ledgers();
        for (const scn of kVariantNames) {
            const ledger = sims[scn];
            this.pruneConsumed(ledger, res, orders);
            for (const room of rooms) {
                for (const dir of ["buy", "sell"] as Dir[]) this.candidates.delete(this.key(scn, room.name, res, dir));
                const stock = roomStock(room, res) + (view.rule.start || 0) + ((ledger.delta[room.name] || {})[res] || 0);
                for (const c of this.propose(scn, room, view, stock, ledger, scn)) {
                    this.candidates.set(this.key(scn, room.name, res, c.dir), c);
                }
            }
        }
        // Live: the real stock, no dry-run start, pending deals count as consumed.
        const live = liveState();
        if (isVariant(live.scenario)) {
            this.pruneConsumed(live.ledger, res, orders);
            for (const room of rooms) {
                for (const dir of ["buy", "sell"] as Dir[]) this.candidates.delete(this.key("live", room.name, res, dir));
                const stock = roomStock(room, res);
                for (const c of this.propose(live.scenario, room, view, stock, live.ledger, "live")) {
                    c.live = true;
                    this.candidates.set(this.key("live", room.name, res, c.dir), c);
                }
            }
        }
    }

    key(scn: string, room: string, res: string, dir: Dir): string {
        return `${scn}|${room}|${res}|${dir}`;
    }

    // Forget what was taken from orders no longer in the book.
    pruneConsumed(ledger: Ledger, res: ResourceConstant, orders: Order[]) {
        const used = ledger.consumed[res];
        if (!used) return;
        const live = new Set(orders.map(o => o.id));
        for (const id in used) if (!live.has(id)) delete used[id];
        if (_.isEmpty(used)) delete ledger.consumed[res];
    }

    available(ledger: Ledger, res: ResourceConstant, order: Order): number {
        const used = ledger.consumed[res];
        return Math.max(0, order.amount - ((used && used[order.id]) || 0));
    }

    // The trades a variant's band allows for one resource in one room, at
    // most one buy and one sell. `tag` names the ledger ("vg15", "live") for
    // what status() shows.
    propose(scn: Variant, room: Room, v: ResView, stock: number, ledger: Ledger, tag: string): Candidate[] {
        const out: Candidate[] = [];
        const rule = v.rule;
        const band = bandOf(rule, stock, kVariants[scn]);
        const seen: Seen = { tick: Game.time, stock, band, notes: [] };
        this.seen.set(`${tag}|${room.name}|${v.res}`, seen);
        if (band.buyMult === undefined && band.sellMult === undefined) return out;

        const energy = energyValue(room);
        const chunk = rule.chunk || kChunk;
        const base = { scn, room: room.name, res: v.res, kind: band.band, tick: Game.time };
        const fairBuy = v.ask.mid !== undefined && v.ask.slow !== undefined ? Math.min(v.ask.mid, v.ask.slow) : undefined;
        const fairSell = v.bid.mid !== undefined && v.bid.slow !== undefined ? Math.max(v.bid.mid, v.bid.slow) : undefined;
        const surcharge = 2 * kTypicalRate * energy;
        // What a bought unit must stay under to be resold at fair sell without
        // a loss; Infinity where the test does not apply or nothing prices it.
        const resale = _.contains(kSurcharged, band.band) && fairSell !== undefined ? fairSell - surcharge : Infinity;
        // The ask-to-bid guard: the best bid anyone real posts, or none.
        const bestBid = _.find(v.bids, o => o.price >= kRealBid);
        const askCap = bestBid ? kAskOverBid * bestBid.price : Infinity;
        const first = (orders: Order[], dir: Dir, ok: (o: Order, eff: number) => boolean): [Order, number] | undefined => {
            for (const o of orders) {
                if (this.available(ledger, v.res, o) <= 0) continue;
                const eff = effective(o, dir, room.name, energy);
                if (dir === "buy" && eff > askCap) return undefined;
                return ok(o, eff) ? [o, eff] : undefined;   // best first: if the best fails, all do
            }
            return undefined;
        };
        const where = `stock ${stock} in ${band.band} [${band.lo}, ${band.hi})`;

        if (band.buyMult !== undefined) {
            const mult = band.buyMult;
            const room_ = band.hi - stock;
            if (v.suspect) seen.notes.push("buy: suspect");
            else if (fairBuy === undefined) seen.notes.push("buy: no fair buy");
            else if (!(room_ > 0)) seen.notes.push("buy: at the band's top");
            else {
                const cap = Math.min(rule.ceil ?? Infinity, mult * fairBuy, resale);
                const capped = resale < mult * fairBuy ? ` (resale ${fmt(fairSell)} - surcharge ${fmt(surcharge)})` : "";
                seen.cap = cap;
                const hit = first(v.asks, "buy", (o, eff) => eff <= cap);
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, dir: "buy", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), Math.ceil(room_)), delta: cap - eff,
                        why: `${where}: buy x${mult.toFixed(2)} cap ${fmt(cap)} (fair buy ${fmt(fairBuy)})${capped}, ask ${fmt(eff)} eff` });
                } else {
                    const best = _.find(v.asks, o => this.available(ledger, v.res, o) > 0);
                    seen.notes.push(`buy: no ask <= cap ${fmt(cap)}${capped}` + (best ? ` (best ${fmt(effective(best, "buy", room.name, energy))} eff${effective(best, "buy", room.name, energy) > askCap ? ", over 2x best bid" : ""})` : " (no asks)"));
                }
            }
        }

        if (band.sellMult !== undefined) {
            const mult = band.sellMult;
            const down = stock - band.lo;
            const liquidate = band.band === "liquidate";
            if (!liquidate && fairSell === undefined) seen.notes.push("sell: no fair sell");
            else if (!(down > 0)) seen.notes.push("sell: at the band's bottom");
            else {
                // Liquidate: sellMult 0, so the floor is only the rule's
                // floor; the bid must be a real one.
                const floor = Math.max(rule.floor ?? 0, liquidate ? 0 : mult * fairSell!);
                seen.floor = floor;
                const hit = first(v.bids, "sell", (o, eff) => eff >= floor && (!liquidate || o.price >= kRealBid));
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, dir: "sell", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), Math.floor(down)), delta: eff - floor,
                        why: `${where}: sell x${mult.toFixed(2)} floor ${fmt(floor)} (fair sell ${fmt(fairSell)}), bid ${fmt(eff)} eff` });
                } else {
                    const best = _.find(v.bids, o => this.available(ledger, v.res, o) > 0);
                    seen.notes.push(`sell: no bid >= floor ${fmt(floor)}` + (best ? ` (best ${fmt(effective(best, "sell", room.name, energy))} eff)` : " (no bids)"));
                }
            }
        }
        return out;
    }

    rank(c: Candidate): number {
        return (_.contains(kMandatory, c.kind) ? 1e12 : 0) + c.delta;
    }

    // Each variant's paper terminal that is off cooldown fills its best candidate.
    fillDue(rooms: Room[]) {
        const sims = ledgers();
        for (const scn of kVariantNames) {
            const ledger = sims[scn];
            for (const room of rooms) {
                if ((ledger.cool[room.name] || 0) > Game.time) continue;
                const fresh = this.fresh();
                const mine = Array.from(this.candidates.values())
                    .filter(c => !c.live && c.scn === scn && c.room === room.name && c.qty > 0 && Game.time - c.tick <= fresh);
                if (!mine.length) continue;
                mine.sort((a, b) => this.rank(b) - this.rank(a));
                for (const c of mine) {
                    if (this.fill(ledger, c, room)) break;
                }
            }
        }
    }

    // Book a candidate against the live order; false when the order is gone or spent.
    fill(ledger: Ledger, c: Candidate, room: Room): boolean {
        this.candidates.delete(this.key(c.scn, c.room, c.res, c.dir));
        const order = getOrderById(c.orderId);
        if (!order || order.amount <= 0) return false;
        // Repriced since the evaluation: the edge was computed on the old
        // price, so let the next evaluation judge it again.
        if (Math.abs(order.price - c.price) > 1e-6) return false;
        const qty = Math.min(c.qty, this.available(ledger, c.res, order));
        if (qty <= 0) return false;
        const rate = transferRate(room.name, c.orderRoom);
        const energy = Math.ceil(qty * rate);
        const value = qty * order.price;
        const sign = c.dir === "buy" ? 1 : -1;
        ((ledger.delta[room.name] = ledger.delta[room.name] || {})[c.res] =
            ((ledger.delta[room.name] || {})[c.res] || 0) + sign * qty);
        ledger.cash += c.dir === "buy" ? -value : value;
        ledger.energy += energy;
        ledger.deals++;
        ledger.cool[room.name] = Game.time + kCooldown;
        const used = ledger.consumed[c.res] = ledger.consumed[c.res] || {};
        used[order.id] = (used[order.id] || 0) + qty;
        const st = ledger.stats[c.res] = ledger.stats[c.res] || [0, 0, 0, 0, 0];
        if (c.dir === "buy") { st[0] += qty; st[1] += value; } else { st[2] += qty; st[3] += value; }
        st[4]++;
        ledger.fills.push([Game.time, c.res, c.dir, c.kind, order.id, c.orderRoom, order.price, qty, Math.round(c.delta * 100) / 100, room.name]);
        if (ledger.fills.length > kFills) ledger.fills.splice(0, ledger.fills.length - kFills);
        debug.log(`TRADER ${c.scn} ${c.kind} ${c.dir} ${qty} ${c.res} @ ${order.price} (${c.eff.toFixed(1)} eff, +${c.delta.toFixed(1)}) ${c.orderRoom} ${order.id} ${energy}e: ${c.why}`);
        return true;
    }

    // --- live -----------------------------------------------------------------

    // Deals made last tick: booked when the transaction log shows them, else failed.
    verifyPending() {
        const live = liveState();
        if (!live.pending.length) return;
        const still: Pending[] = [];
        for (const p of live.pending) {
            if (p.tick >= Game.time) { still.push(p); continue; }
            const log = p.dir === "sell" ? Game.market.outgoingTransactions : Game.market.incomingTransactions;
            const t = _.find(log, t => t.time >= p.tick && !!t.order && t.order.id === p.orderId && t.resourceType === p.res);
            const other = t ? (p.dir === "sell" ? t.recipient : t.sender)?.username || "NPC" : undefined;
            if (!t) {
                live.failed++;
                debug.log(`TRADER LIVE FAILED ${p.kind} ${p.dir} ${p.qty} ${p.res} @ ${p.price} ${p.orderRoom} ${p.orderId}: no transaction`);
                this.noteWatch(p, undefined, false);
                continue;
            }
            const qty = t.amount;
            const value = qty * p.price;
            const energy = Math.ceil(qty * transferRate(p.room, p.orderRoom));
            const l = live.ledger;
            const sign = p.dir === "buy" ? 1 : -1;
            (l.delta[p.room] = l.delta[p.room] || {})[p.res] = ((l.delta[p.room] || {})[p.res] || 0) + sign * qty;
            l.cash += p.dir === "buy" ? -value : value;
            l.energy += energy;
            l.deals++;
            const st = l.stats[p.res] = l.stats[p.res] || [0, 0, 0, 0, 0];
            if (p.dir === "buy") { st[0] += qty; st[1] += value; } else { st[2] += qty; st[3] += value; }
            st[4]++;
            l.fills.push([p.tick, p.res, p.dir, p.kind, p.orderId, p.orderRoom, p.price, qty, Math.round(p.delta * 100) / 100, p.room]);
            if (l.fills.length > kFills) l.fills.splice(0, l.fills.length - kFills);
            debug.log(`TRADER LIVE ${p.kind} ${p.dir} ${qty}/${p.qty} ${p.res} @ ${p.price} with ${other} ${p.orderRoom} ${p.orderId} ${energy}e, credits ${Math.round(Game.market.credits).toLocaleString()}`);
            this.noteWatch(p, other, true);
        }
        live.pending = still;
    }

    // Record a deal with a watched player (by the transaction's name, or by
    // the room's known owner when the deal left no transaction).
    noteWatch(p: Pending, other: string | undefined, ok: boolean) {
        const who = other || RoomIntel.get(p.orderRoom)?.owner || undefined;
        if (!who || !_.contains(kWatchPlayers, who)) return;
        const live = liveState();
        live.watch.push([p.tick, who, p.res, p.dir, p.qty, p.price, p.orderRoom, p.orderId, ok]);
        if (live.watch.length > kWatch) live.watch.splice(0, live.watch.length - kWatch);
        debug.log(`TRADER WATCH ${who}: ${ok ? "dealt" : "FAILED"} ${p.dir} ${p.qty} ${p.res} @ ${p.price} from ${p.orderRoom} ${p.orderId}`);
    }

    // One real deal per room per tick for the live variant's best candidate.
    dealLive(rooms: Room[]) {
        const live = liveState();
        if (!isVariant(live.scenario) || live.halted) return;
        const credits = Game.market.credits;
        if (credits < live.floor) {
            live.halted = `credits ${Math.round(credits).toLocaleString()} under floor ${live.floor.toLocaleString()} at ${Game.time}`;
            debug.log("TRADER HALTED:", live.halted);
            Game.notify(`Trader halted: ${live.halted}`);
            return;
        }
        const fresh = this.fresh();
        for (const room of rooms) {
            const term = room.terminal!;
            if (term.cooldown) continue;
            if (_.any(live.pending, p => p.room === room.name)) continue;
            const mine = Array.from(this.candidates.values())
                .filter(c => c.live && c.room === room.name && c.qty > 0 && Game.time - c.tick <= fresh);
            if (!mine.length) continue;
            mine.sort((a, b) => this.rank(b) - this.rank(a));
            for (const c of mine) {
                if (this.deal(live, c, term)) break;
            }
        }
    }

    // Try one candidate for real; true when a deal intent was placed.
    deal(live: Live, c: Candidate, term: StructureTerminal): boolean {
        this.candidates.delete(this.key("live", c.room, c.res, c.dir));
        const order = getOrderById(c.orderId);
        if (!order || order.amount <= 0 || Math.abs(order.price - c.price) > 1e-6) return false;
        let qty = Math.min(c.qty, order.amount);
        if (c.dir === "sell") qty = Math.min(qty, term.store[c.res] || 0);
        else {
            qty = Math.min(qty, term.store.getFreeCapacity());
            // Never buy the credits under the floor.
            qty = Math.min(qty, Math.floor((Game.market.credits - live.floor) / order.price));
        }
        if (qty <= 0) return false;
        const cost = Game.market.calcTransactionCost(qty, c.room, c.orderRoom);
        // Selling energy: the goods and the transfer both come out of the terminal.
        const need = cost + (c.dir === "sell" && c.res === RESOURCE_ENERGY ? qty : 0);
        if (need > term.store.energy) {
            debug.log(`TRADER LIVE skip ${c.dir} ${qty} ${c.res}: transfer ${cost} energy, terminal holds ${term.store.energy}`);
            return false;
        }
        const err = Game.market.deal(c.orderId, qty, c.room);
        if (err !== OK) {
            debug.log(`TRADER LIVE deal ${c.dir} ${qty} ${c.res} @ ${order.price} ${c.orderRoom} ${c.orderId} -> ${debug.errStr(err)}`);
            return false;
        }
        live.pending.push({ tick: Game.time, room: c.room, res: c.res, dir: c.dir, kind: c.kind, orderId: c.orderId, orderRoom: c.orderRoom, price: order.price, qty, delta: c.delta });
        const used = live.ledger.consumed[c.res] = live.ledger.consumed[c.res] || {};
        used[order.id] = (used[order.id] || 0) + qty;
        debug.log(`TRADER LIVE dealing ${c.kind} ${c.dir} ${qty} ${c.res} @ ${order.price} (${c.eff.toFixed(1)} eff, +${c.delta.toFixed(1)}) ${c.orderRoom} ${c.orderId} ${cost}e: ${c.why}`);
        return true;
    }

    // --- the emergency energy sell order ----------------------------------------

    energyOrders(rooms: Room[]) {
        const live = liveState();
        const eo = traderMem().eorders = traderMem().eorders || {};
        for (const room of rooms) {
            // An order already standing is looked after even with live trading
            // off (it is real either way); a new one only while live.
            if (!eo[room.name] && !isVariant(live.scenario)) continue;
            try {
                this.energyOrder(room, eo, live);
            } catch (err) {
                debug.log(`TRADER energy order ${room.name} threw: ${err}`);
            }
        }
    }

    // The lowest foreign energy ask, or undefined.
    lowestEnergyAsk(): number | undefined {
        const asks = getAllOrders({ type: ORDER_SELL, resourceType: RESOURCE_ENERGY })
            .filter(o => !Game.market.orders[o.id] && o.amount > 0 && o.price > 0);
        const low = _.min(asks, o => o.price) as Order | number;
        return typeof low === "number" ? undefined : low.price;
    }

    // The lowest price the emergency order may ask: kEmergencyFloor x energy's
    // bid-side slow, else x the best real foreign bid; undefined (no order)
    // when energy has neither.
    energyFloor(): number | undefined {
        const slow = credits(slowOf(trackOf(RESOURCE_ENERGY, "buy")));
        if (slow !== undefined) return kEmergencyFloor * slow;
        const bids = getAllOrders({ type: ORDER_BUY, resourceType: RESOURCE_ENERGY })
            .filter(o => !Game.market.orders[o.id] && o.amount > 0 && o.price >= kRealBid);
        if (!bids.length) return undefined;
        return kEmergencyFloor * _.max(bids.map(o => o.price));
    }

    // kEmergencyUnder under the lowest other ask, never under the floor;
    // undefined when there is no ask or no floor.
    energyAskPrice(): [number, number, number] | undefined {
        const low = this.lowestEnergyAsk();
        const floor = this.energyFloor();
        if (low === undefined || floor === undefined) return undefined;
        const price = Math.ceil(Math.max(low * kEmergencyUnder, floor) * 1000) / 1000;
        return [price, low, floor];
    }

    energyOrder(room: Room, eo: { [room: string]: EnergyOrder }, live: Live) {
        const storage = room.storage;
        const energy = (storage ? storage.store.energy : 0) + (room.terminal ? room.terminal.store.energy : 0);
        const urgent = !!storage && storage.store.getUsedCapacity() > kEmergencyFill * storage.store.getCapacity() && energy > kEmergencyEnergy;
        const canPay = (fee: number) => !live.halted && Game.market.credits - fee >= live.floor;
        let rec: EnergyOrder | undefined = eo[room.name];
        let order: Order | undefined;
        if (rec && !rec.id) {
            // Created; the order shows in Game.market.orders from the next tick.
            order = _.find(Game.market.orders, o => o.type === ORDER_SELL && o.resourceType === RESOURCE_ENERGY &&
                o.roomName === room.name && o.created >= rec!.made);
            if (order) {
                rec.id = order.id;
                debug.log(`TRADER energy order ${room.name}: ${order.id} @ ${order.price}, ${order.remainingAmount} left`);
            } else if (Game.time - rec.made > kCreateWait) {
                debug.log(`TRADER energy order ${room.name}: created at ${rec.made} but never showed`);
                delete eo[room.name];
            }
            return;
        }
        if (rec && rec.id) {
            order = Game.market.orders[rec.id];
            if (!order) {
                debug.log(`TRADER energy order ${room.name}: ${rec.id} is gone`);
                delete eo[room.name];
                rec = undefined;
            }
        }
        if (!rec || !order) {
            if (!urgent || !isVariant(live.scenario)) return;
            const quote = this.energyAskPrice();
            if (!quote) return;
            const [price, low, floor] = quote;
            const fee = price * kEmergencyAmount * MARKET_FEE;
            if (!canPay(fee)) return;
            const err = Game.market.createOrder({ type: ORDER_SELL, resourceType: RESOURCE_ENERGY, price, totalAmount: kEmergencyAmount, roomName: room.name });
            debug.log(`TRADER energy order ${room.name}: storage ${storage!.store.getUsedCapacity()}/${storage!.store.getCapacity()}, energy ${energy}: ` +
                `sell ${kEmergencyAmount} @ ${price} (lowest other ask ${low}, floor ${floor.toFixed(3)}), fee ${fee.toFixed(0)} -> ${debug.errStr(err)}`);
            if (err === OK) eo[room.name] = { made: Game.time };
            return;
        }
        // Empty and no longer needed: cancel. Amount left: it stays.
        if (order.remainingAmount <= 0 && !urgent) {
            const err = Game.market.cancelOrder(order.id);
            debug.log(`TRADER energy order ${room.name}: cancel ${order.id} (empty, storage ${storage ? storage.store.getUsedCapacity() : 0}, energy ${energy}) -> ${debug.errStr(err)}`);
            if (err === OK) delete eo[room.name];
            return;
        }
        // Topped back up while the room still needs it.
        if (urgent && order.remainingAmount < kEmergencyAmount) {
            const add = kEmergencyAmount - order.remainingAmount;
            const fee = order.price * add * MARKET_FEE;
            if (canPay(fee)) {
                const err = Game.market.extendOrder(order.id, add);
                debug.log(`TRADER energy order ${room.name}: extend ${order.id} by ${add} @ ${order.price}, fee ${fee.toFixed(0)} -> ${debug.errStr(err)}`);
            }
        }
        // Repriced when no longer the lowest ask and the price is old enough
        // (age counted from the creation or the last reprice).
        const age = Game.time - Math.max(rec.made, rec.priced || 0, order.created || 0);
        if (age >= kRepriceAge && Game.time % kRepriceCheck === 0) {
            const quote = this.energyAskPrice();
            if (quote && quote[1] <= order.price) {
                const [price, low, floor] = quote;
                if (price < order.price) {
                    const err = Game.market.changeOrderPrice(order.id, price);
                    debug.log(`TRADER energy order ${room.name}: reprice ${order.id} ${order.price} -> ${price} (lowest other ask ${low}, floor ${floor.toFixed(3)}) -> ${debug.errStr(err)}`);
                    if (err === OK) rec.priced = Game.time;
                }
            }
        }
    }

    // --- console ----------------------------------------------------------------

    // Console: live('vg15'[, floor]) deals that variant for real; live(null) stops.
    live(variant: string | null, floor?: number): string {
        const live = liveState();
        if (variant && !isVariant(variant)) return `unknown variant ${variant}; one of ${kVariantNames.join(", ")}`;
        live.scenario = variant;
        if (floor !== undefined) live.floor = floor;
        if (!variant) for (const key of Array.from(this.candidates.keys())) if (key.startsWith("live|")) this.candidates.delete(key);
        return `live: ${variant || "off"}, floor ${live.floor.toLocaleString()}${live.halted ? ", HALTED: " + live.halted : ""}`;
    }

    resume(): string {
        const live = liveState();
        const was = live.halted;
        delete live.halted;
        return was ? `resumed (was: ${was})` : "was not halted";
    }

    // One line: the ledgers and the live state (lsProcess/statusServices).
    summary(): string {
        const sims = ledgers();
        const parts = kVariantNames.map(n => `${n}: ${sims[n].deals} deals, cash ${Math.round(sims[n].cash).toLocaleString()}`);
        const live = liveState();
        const liveStr = live.scenario
            ? `LIVE ${live.scenario} floor ${live.floor.toLocaleString()}${live.halted ? " HALTED" : ""}: ${live.ledger.deals} deals, ${live.failed} failed, ${live.pending.length} pending, cash ${Math.round(live.ledger.cash).toLocaleString()}, credits ${Math.round(Game.market.credits).toLocaleString()}; `
            : "paper only; ";
        const eo = traderMem().eorders || {};
        const eoStr = Object.keys(eo).length ? `energy orders ${Object.keys(eo).map(r => `${r}:${eo[r].id || "creating"}`).join(", ")}; ` : "";
        return `${super.status()} ${liveStr}${eoStr}${this.evaluated} evaluations, ${this.candidates.size} candidates, last tick ${this.lastCpu.toFixed(2)} CPU; ${parts.join("; ")}`;
    }

    toString(): string {
        return `${this.name} [${this.summary()}]`;
    }

    // The summary line, then per room and ruled resource (the live variant's
    // view, or vg15's on paper): stock, band and multipliers, cap/floor, the
    // candidates or why none. status('vg10') shows that variant's view.
    status(variant?: string): string {
        const live = liveState();
        const tag = variant || (isVariant(live.scenario) ? "live" : "vg15");
        const lines = [this.summary()];
        for (const [key, s] of this.seen) {
            const [t, room, res] = key.split("|");
            if (t !== tag) continue;
            const cands = (["buy", "sell"] as Dir[]).map(d => this.candidates.get(this.key(tag, room, res, d)))
                .filter(c => !!c).map(c => `${c!.dir} ${c!.qty} @ ${c!.price} (${fmt(c!.eff)} eff, +${fmt(c!.delta)}) ${c!.orderRoom}`);
            lines.push(`${room} ${res.padEnd(6)} ${String(s.stock).padStart(7)} ${bandStr(s.band).padEnd(22)}` +
                ` cap ${fmt(s.cap).padStart(6)} floor ${fmt(s.floor).padStart(6)} ` +
                (cands.length ? cands.join("; ") : "") + (s.notes.length ? (cands.length ? " | " : "") + s.notes.join("; ") : "") +
                ` (${Game.time - s.tick} ago)`);
        }
        return lines.join("\n");
    }

    // Start the ledgers over (the rules or assumptions changed).
    reset(scn?: string): string {
        const t = traderMem();
        for (const name of kVariantNames) if (!scn || scn === name) t.sim[name] = blankLedger();
        this.candidates.clear();
        return `reset ${scn || "all"}`;
    }
}

// traderReport() prints each ledger: cash, energy, deals, the net position
// marked at the mid of the two sides' slows, and per resource what was
// bought and sold and the band each terminal room's real stock is in now;
// traderReport("vg15", 30) adds the last 30 fills of that variant.
export function report(scn?: string, fills = 0): string {
    const sims: { [name: string]: Ledger } = Object.assign({}, (Memory.trader && Memory.trader.sim) || {});
    const live = Memory.trader && Memory.trader.live;
    if (live && live.scenario) sims[`live(${live.scenario})`] = live.ledger;
    const rooms = _.filter(Game.rooms, r => !!r.terminal && r.terminal.my && !!r.controller && r.controller.my);
    const lines: string[] = [];
    if (live && live.scenario) {
        lines.push(`live ${live.scenario}: floor ${live.floor.toLocaleString()}, ${live.halted ? "HALTED (" + live.halted + ")" : "running"}, ${live.failed} failed, ${live.pending.length} pending, credits ${Math.round(Game.market.credits).toLocaleString()}`);
    }
    for (const name of Object.keys(sims)) {
        if (scn && scn !== name && !(scn === "live" && name.startsWith("live"))) continue;
        const l = sims[name];
        const margin = (kVariants as any)[name] ?? (live && isVariant(live.scenario) ? kVariants[live.scenario] : undefined);
        let marked = 0;
        const rows: string[] = [];
        for (const res of Object.keys(l.stats).sort()) {
            const [bought, spent, sold, earned, deals] = l.stats[res];
            const net = _.sum(_.values(l.delta), (d: any) => d[res] || 0) as number;
            const rec = Memory.market[res as ResourceConstant];
            const bidSlow = credits(slowOf(rec && rec.b));
            const askSlow = credits(slowOf(rec && rec.s));
            // Marked at the mid of the two slows (one side when only one is priced).
            const mark = bidSlow !== undefined && askSlow !== undefined ? (bidSlow + askSlow) / 2 : (bidSlow ?? askSlow ?? 0);
            marked += net * mark;
            const rule = ruleFor(res);
            const bands = margin === undefined ? "" : rooms.map(r => `${r.name} ${bandStr(bandOf(rule, roomStock(r, res as ResourceConstant), margin))}`).join(", ");
            rows.push(`  ${res.padEnd(14)} ${String(deals).padStart(3)} deals  bought ${String(bought).padStart(6)} for ${Math.round(spent).toLocaleString().padStart(12)}` +
                `  sold ${String(sold).padStart(6)} for ${Math.round(earned).toLocaleString().padStart(12)}  net ${String(net).padStart(6)} @ ${mark.toFixed(1)}` +
                (bands ? `  now ${bands}` : ""));
        }
        lines.push(`${name}: ${l.deals} deals since ${Game.time - l.start} ticks, cash ${Math.round(l.cash).toLocaleString()}, ` +
            `position ${Math.round(marked).toLocaleString()} at mid of slows, total ${Math.round(l.cash + marked).toLocaleString()}, energy ${l.energy.toLocaleString()}`);
        lines.push(...rows);
        if (fills > 0) {
            for (const f of l.fills.slice(-fills)) {
                lines.push(`  ${f[0]} ${f[3].padEnd(9)} ${f[2]} ${String(f[7]).padStart(5)} ${f[1].padEnd(13)} @ ${f[6]} +${f[8]} ${f[5]} ${f[4]}`);
            }
        }
    }
    return lines.length ? lines.join("\n") : "no trader ledgers";
}

// traderWatch() lists every live deal (or failed deal) with a watched player.
export function watchReport(): string {
    const live = Memory.trader && Memory.trader.live;
    if (!live || !live.watch.length) return "no deals with watched players (" + kWatchPlayers.join(", ") + ")";
    return live.watch.map(w => `${w[0]} ${w[1].padEnd(6)} ${w[8] ? "dealt " : "FAILED"} ${w[3]} ${String(w[4]).padStart(5)} ${w[2].padEnd(13)} @ ${w[5]} ${w[6]} ${w[7]}`).join("\n");
}
