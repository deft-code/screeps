import * as debug from "debug";
import { Priority, register, Service } from "process";
import { getAllOrders, getOrderById, marketDisabled } from "markethack";
import { isSuspect } from "marketcfg";
import { ruleFor, ruledResources, StockRule } from "stockrules";
import { oldestOf, slowOf, trackOf, transferRate, tryGetBuyOrderPrice, tryGetSellOrderPrice } from "market";

// The trader (docs/market-design.md), in its dry-run form: nothing here calls
// Game.market.deal. Every tick it looks at a few ruled resources (kPerTick,
// round robin), and for each scenario and each room with a terminal works out
// the trade that scenario would make; when a scenario's paper terminal is off
// its cooldown it "fills" the best candidate and books it in that scenario's
// ledger (Memory.trader.sim[name]): virtual stock per resource, cash, the
// transfer energy burned, the quantity taken from each order (so the same
// order is not filled twice while it still shows in the book), and the last
// kFills fills. traderReport() prints the ledgers side by side.
//
//   scheduleService('Trader')
//
// Stock rules (stockrules.ts) give each resource need/want/surplus/glut; a
// resource's stock is what the room's storage, terminal and factory hold,
// plus the rule's dry-run `start`, plus the scenario's net fills.
//
// Mandatory trades are the same in every scenario: under `need` buy the best
// ask if it is not over min(ceil, 1.3 x the ask side's slow); over `glut` sell
// into the best bid if it is not under max(floor, 0.7 x the bid side's slow).
// A suspect resource (marketcfg) is never bought. Then the optional trades,
// `want` buys and `surplus` sells, which is where the scenarios differ:
//
//   fairA     fair buy = the bid side's slow, fair sell = the ask side's slow:
//             an ask at or under what buyers usually pay is a good buy, a bid
//             at or over what sellers usually ask is a good sell. Optional
//             trades only while fair sell - fair buy >= the surcharge.
//   fourState the first draft's trend table on now/mid/slow of one side with a
//             2% deadband: sell when the bid side is topping (now under mid,
//             mid over slow) or flat with now at or over slow; buy when the ask
//             side is bottoming (now over mid, mid under slow) or flat with
//             now at or under slow. Deals into the best order. No gap test.
//   fairB     same-side fair prices: fair buy = the lower of the ask side's mid
//             and slow, fair sell = the higher of the bid side's mid and slow;
//             a good buy is an ask at or under fair buy, a good sell a bid at
//             or over fair sell, and optional trades only while
//             fair sell - fair buy >= the surcharge. A side with no price
//             passes the test for the other side's action (a round trip is
//             impossible without it). Added after the first hours of the dry
//             run (6 Nov 2026) because fairA stalls on one-sided books.
//   fourGap   fourState's timing with fairB's surcharge test and fair prices
//             as guards (buy at or under fair buy, sell at or over fair sell).
//             Added at the same time: fourState churned purifier at a loss.
//
// Prices are effective: an ask costs its price plus our transfer energy, a
// bid pays its price minus it, energy valued at zero while the room's storage
// is over half full of energy and at energy's bid-side slow otherwise. The
// surcharge is that energy value on both legs at the typical rate. Optional
// candidates are ordered by absolute price delta (credits a unit between the
// order and the fair price it beats), mandatory ones first.

const kScenarioNames = ["fairA", "fourState", "fairB", "fourGap"] as const;
type ScenarioName = typeof kScenarioNames[number];

// Resources examined per tick.
const kPerTick = 5;
// A candidate older than one evaluation cycle plus this is not used.
const kFreshSlack = 2;
// Paper terminal cooldown per deal.
const kCooldown = TERMINAL_COOLDOWN;
// Fills kept per ledger.
const kFills = 150;
// Mandatory price guards against slow.
const kNeedOver = 1.3;
const kGlutUnder = 0.7;
// Deadband of the four-state comparisons.
const kBand = 0.02;
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

type Kind = "need" | "want" | "surplus" | "glut";
type Dir = "buy" | "sell";

interface Candidate {
    scn: ScenarioName
    room: string
    res: ResourceConstant
    kind: Kind
    dir: Dir
    orderId: string
    orderRoom: string
    price: number       // credits, the order's
    eff: number         // credits, after transfer
    qty: number
    delta: number       // credits a unit of edge over the fair price
    tick: number
    why: string
}

// [tick, res, dir, kind, orderId, orderRoom, price, qty, delta, room]
type Fill = [number, string, Dir, Kind, string, string, number, number, number, string];

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

declare global {
    interface Memory {
        trader?: {
            sim: { [name: string]: Ledger }
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

const credits = (milli?: number) => milli === undefined ? undefined : milli / 1000;

function sideView(res: ResourceConstant, side: Dir): SideView {
    const t = trackOf(res, side);
    return { now: credits(t.now), mid: credits(t.mid), slow: credits(slowOf(t)), oldest: credits(oldestOf(t)) };
}

// The room's real stock of a resource: storage, terminal and factory.
function roomStock(room: Room, res: ResourceConstant): number {
    let n = 0;
    for (const s of [room.storage, room.terminal, ...room.findStructs(STRUCTURE_FACTORY)]) {
        if (s && s.my) n += s.store[res] || 0;
    }
    return n;
}

// Credits a unit of transfer energy costs the room: nothing while the storage
// is over half full of energy, energy's bid-side slow otherwise.
function energyValue(room: Room): number {
    const storage = room.storage;
    if (storage && storage.store.energy > storage.store.getCapacity() / 2) return 0;
    const slow = credits(slowOf(trackOf(RESOURCE_ENERGY, "buy")));
    return slow ?? Math.max(0, tryGetBuyOrderPrice(RESOURCE_ENERGY, room.name));
}

function effective(order: Order, dir: Dir, room: string, energy: number): number {
    const cost = order.roomName ? transferRate(room, order.roomName) * energy : 0;
    return dir === "buy" ? order.price + cost : order.price - cost;
}

function blankLedger(): Ledger {
    return { start: Game.time, cash: 0, energy: 0, deals: 0, cool: {}, delta: {}, consumed: {}, stats: {}, fills: [] };
}

function ledgers(): { [name: string]: Ledger } {
    const t = Memory.trader = Memory.trader || { sim: {} };
    for (const name of kScenarioNames) t.sim[name] = t.sim[name] || blankLedger();
    return t.sim;
}

// Relation of a to b with the deadband: 1 above, -1 below, 0 flat.
function cmp(a: number, b: number): number {
    if (a > b * (1 + kBand)) return 1;
    if (a < b * (1 - kBand)) return -1;
    return 0;
}

type State = "rising" | "topping" | "falling" | "bottoming" | "flat" | "unknown";

function stateOf(v: SideView): State {
    if (v.now === undefined || v.mid === undefined || v.slow === undefined) return "unknown";
    const nm = cmp(v.now, v.mid);
    if (nm === 0) return "flat";
    const ms = cmp(v.mid, v.slow);
    if (nm > 0) return ms < 0 ? "bottoming" : "rising";
    return ms > 0 ? "topping" : "falling";
}

@register
export class Trader extends Service {
    private cursor = 0;
    private candidates = new Map<string, Candidate>();
    private lastCpu = 0;
    private evaluated = 0;

    run(): Priority {
        if (marketDisabled()) {
            debug.log(this.name, "no market on", Game.shard.name, "- killing");
            this.kill();
            return "kill";
        }
        const cpu = Game.cpu.getUsed();
        const rooms = _.filter(Game.rooms, r => !!r.terminal && r.terminal.my && !!r.controller && r.controller.my);
        if (rooms.length) {
            this.evaluateSome(rooms);
            this.fillDue(rooms);
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
        const orders = getAllOrders({ resourceType: res }).filter(o => !Game.market.orders[o.id] && o.amount > 0 && !!o.roomName);
        const view: ResView = {
            res, rule: ruleFor(res), suspect: isSuspect(res),
            bid: sideView(res, "buy"), ask: sideView(res, "sell"),
            bids: _.sortBy(orders.filter(o => o.type === ORDER_BUY), o => -o.price),
            asks: _.sortBy(orders.filter(o => o.type === ORDER_SELL), o => o.price),
        };
        const sims = ledgers();
        for (const scn of kScenarioNames) {
            const ledger = sims[scn];
            this.pruneConsumed(ledger, res, orders);
            for (const room of rooms) {
                for (const kind of ["need", "glut", "want", "surplus"] as Kind[]) this.candidates.delete(this.key(scn, room.name, res, kind));
                const stock = roomStock(room, res) + (view.rule.start || 0) + ((ledger.delta[room.name] || {})[res] || 0);
                for (const c of this.propose(scn, room, view, stock, ledger)) {
                    this.candidates.set(this.key(scn, room.name, res, c.kind), c);
                }
            }
        }
    }

    key(scn: string, room: string, res: string, kind: Kind): string {
        return `${scn}|${room}|${res}|${kind}`;
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

    // The trades a scenario would make for one resource in one room.
    propose(scn: ScenarioName, room: Room, v: ResView, stock: number, ledger: Ledger): Candidate[] {
        const out: Candidate[] = [];
        const rule = v.rule;
        const energy = energyValue(room);
        const chunk = rule.chunk || kChunk;
        const base = { scn, room: room.name, res: v.res, tick: Game.time };
        // The ask-to-bid guard: the best bid anyone real posts, or none.
        const bestBid = _.find(v.bids, o => o.price >= kRealBid);
        const askCap = bestBid ? kAskOverBid * bestBid.price : Infinity;
        const first = (orders: Order[], dir: Dir, ok: (eff: number) => boolean): [Order, number] | undefined => {
            for (const o of orders) {
                if (this.available(ledger, v.res, o) <= 0) continue;
                const eff = effective(o, dir, room.name, energy);
                if (dir === "buy" && eff > askCap) return undefined;
                return ok(eff) ? [o, eff] : undefined;   // best first: if the best fails, all do
            }
            return undefined;
        };

        // Mandatory.
        if (rule.need !== undefined && stock < rule.need && !v.suspect && v.ask.slow !== undefined) {
            const cap = Math.min(rule.ceil ?? Infinity, kNeedOver * v.ask.slow);
            const hit = first(v.asks, "buy", eff => eff <= cap);
            if (hit) {
                const [o, eff] = hit;
                out.push({ ...base, kind: "need", dir: "buy", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                    qty: Math.min(chunk, this.available(ledger, v.res, o), rule.need - stock), delta: cap - eff,
                    why: `stock ${stock} < need ${rule.need}, ask ${eff.toFixed(1)} <= cap ${cap.toFixed(1)}` });
            }
        }
        if (rule.glut !== undefined && stock > rule.glut && v.bid.slow !== undefined) {
            const floor = Math.max(rule.floor ?? 0, kGlutUnder * v.bid.slow);
            const hit = first(v.bids, "sell", eff => eff >= floor);
            if (hit) {
                const [o, eff] = hit;
                out.push({ ...base, kind: "glut", dir: "sell", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                    qty: Math.min(chunk, this.available(ledger, v.res, o), stock - rule.glut), delta: eff - floor,
                    why: `stock ${stock} > glut ${rule.glut}, bid ${eff.toFixed(1)} >= floor ${floor.toFixed(1)}` });
            }
        }

        // Optional.
        const wantsBuy = rule.want !== undefined && stock < rule.want && !v.suspect;
        const wantsSell = rule.surplus !== undefined && stock > rule.surplus;
        if (!wantsBuy && !wantsSell) return out;

        if (scn === "fairA") {
            const fairBuy = v.bid.slow;
            const fairSell = v.ask.slow;
            if (fairBuy === undefined || fairSell === undefined) return out;
            const surcharge = 2 * kTypicalRate * energy;
            if (fairSell - fairBuy < surcharge) return out;
            if (wantsBuy) {
                const hit = first(v.asks, "buy", eff => eff <= fairBuy && eff <= (rule.ceil ?? Infinity));
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, kind: "want", dir: "buy", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), rule.want! - stock), delta: fairBuy - eff,
                        why: `ask ${eff.toFixed(1)} <= fair buy ${fairBuy.toFixed(1)} (bid slow), stock ${stock} < want ${rule.want}` });
                }
            }
            if (wantsSell) {
                const hit = first(v.bids, "sell", eff => eff >= fairSell && eff >= (rule.floor ?? 0));
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, kind: "surplus", dir: "sell", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), stock - rule.surplus!), delta: eff - fairSell,
                        why: `bid ${eff.toFixed(1)} >= fair sell ${fairSell.toFixed(1)} (ask slow), stock ${stock} > surplus ${rule.surplus}` });
                }
            }
            return out;
        }

        // fairB and fourGap share the same-side fair prices and the gap test.
        const fairBuyB = v.ask.mid !== undefined && v.ask.slow !== undefined ? Math.min(v.ask.mid, v.ask.slow) : undefined;
        const fairSellB = v.bid.mid !== undefined && v.bid.slow !== undefined ? Math.max(v.bid.mid, v.bid.slow) : undefined;
        const gapOk = fairBuyB === undefined || fairSellB === undefined || fairSellB - fairBuyB >= 2 * kTypicalRate * energy;

        if (scn === "fairB") {
            if (!gapOk) return out;
            if (wantsBuy && fairBuyB !== undefined) {
                const hit = first(v.asks, "buy", eff => eff <= fairBuyB && eff <= (rule.ceil ?? Infinity));
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, kind: "want", dir: "buy", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), rule.want! - stock), delta: fairBuyB - eff,
                        why: `ask ${eff.toFixed(1)} <= fair buy ${fairBuyB.toFixed(1)} (ask min(mid, slow)), stock ${stock} < want ${rule.want}` });
                }
            }
            if (wantsSell && fairSellB !== undefined) {
                const hit = first(v.bids, "sell", eff => eff >= fairSellB && eff >= (rule.floor ?? 0));
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, kind: "surplus", dir: "sell", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), stock - rule.surplus!), delta: eff - fairSellB,
                        why: `bid ${eff.toFixed(1)} >= fair sell ${fairSellB.toFixed(1)} (bid max(mid, slow)), stock ${stock} > surplus ${rule.surplus}` });
                }
            }
            return out;
        }

        // fourState and fourGap
        const gated = scn === "fourGap";
        if (gated && !gapOk) return out;
        if (wantsBuy) {
            const st = stateOf(v.ask);
            const go = st === "bottoming" || (st === "flat" && v.ask.now! <= v.ask.slow!);
            const cap = gated ? Math.min(rule.ceil ?? Infinity, fairBuyB ?? Infinity) : (rule.ceil ?? Infinity);
            if (go) {
                const hit = first(v.asks, "buy", eff => eff <= cap);
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, kind: "want", dir: "buy", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), rule.want! - stock), delta: v.ask.slow! - eff,
                        why: `ask side ${st} (now ${v.ask.now!.toFixed(1)} mid ${v.ask.mid!.toFixed(1)} slow ${v.ask.slow!.toFixed(1)}), stock ${stock} < want ${rule.want}` });
                }
            }
        }
        if (wantsSell) {
            const st = stateOf(v.bid);
            const go = st === "topping" || (st === "flat" && v.bid.now! >= v.bid.slow!);
            const floor = gated ? Math.max(rule.floor ?? 0, fairSellB ?? 0) : (rule.floor ?? 0);
            if (go) {
                const hit = first(v.bids, "sell", eff => eff >= floor);
                if (hit) {
                    const [o, eff] = hit;
                    out.push({ ...base, kind: "surplus", dir: "sell", orderId: o.id, orderRoom: o.roomName!, price: o.price, eff,
                        qty: Math.min(chunk, this.available(ledger, v.res, o), stock - rule.surplus!), delta: eff - v.bid.slow!,
                        why: `bid side ${st} (now ${v.bid.now!.toFixed(1)} mid ${v.bid.mid!.toFixed(1)} slow ${v.bid.slow!.toFixed(1)}), stock ${stock} > surplus ${rule.surplus}` });
                }
            }
        }
        return out;
    }

    // Each scenario's paper terminal that is off cooldown fills its best candidate.
    fillDue(rooms: Room[]) {
        const sims = ledgers();
        for (const scn of kScenarioNames) {
            const ledger = sims[scn];
            for (const room of rooms) {
                if ((ledger.cool[room.name] || 0) > Game.time) continue;
                const fresh = this.fresh();
                const mine = Array.from(this.candidates.values())
                    .filter(c => c.scn === scn && c.room === room.name && c.qty > 0 && Game.time - c.tick <= fresh);
                if (!mine.length) continue;
                const rank = (c: Candidate) => (c.kind === "need" || c.kind === "glut" ? 1e12 : 0) + c.delta;
                mine.sort((a, b) => rank(b) - rank(a));
                for (const c of mine) {
                    if (this.fill(ledger, c, room)) break;
                }
            }
        }
    }

    // Book a candidate against the live order; false when the order is gone or spent.
    fill(ledger: Ledger, c: Candidate, room: Room): boolean {
        this.candidates.delete(this.key(c.scn, c.room, c.res, c.kind));
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

    status(): string {
        const sims = ledgers();
        const parts = kScenarioNames.map(n => `${n}: ${sims[n].deals} deals, cash ${Math.round(sims[n].cash).toLocaleString()}`);
        return `${super.status()} dry run, ${this.evaluated} evaluations, ${this.candidates.size} candidates, last tick ${this.lastCpu.toFixed(2)} CPU; ${parts.join("; ")}`;
    }

    // Start the ledgers over (the rules or assumptions changed).
    reset(scn?: ScenarioName): string {
        const t = Memory.trader = Memory.trader || { sim: {} };
        for (const name of kScenarioNames) if (!scn || scn === name) t.sim[name] = blankLedger();
        this.candidates.clear();
        return `reset ${scn || "all"}`;
    }
}

// traderReport() prints each ledger: cash, energy, deals, the net position
// marked at the mid of the two sides' slows, and per
// resource what was bought and sold; traderReport("fairA", 30) adds the last
// 30 fills of that scenario.
export function report(scn?: string, fills = 0): string {
    const sims = (Memory.trader && Memory.trader.sim) || {};
    const lines: string[] = [];
    for (const name of Object.keys(sims)) {
        if (scn && scn !== name) continue;
        const l = sims[name];
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
            rows.push(`  ${res.padEnd(14)} ${String(deals).padStart(3)} deals  bought ${String(bought).padStart(6)} for ${Math.round(spent).toLocaleString().padStart(12)}` +
                `  sold ${String(sold).padStart(6)} for ${Math.round(earned).toLocaleString().padStart(12)}  net ${String(net).padStart(6)} @ ${mark.toFixed(1)}`);
        }
        lines.push(`${name}: ${l.deals} deals since ${Game.time - l.start} ticks, cash ${Math.round(l.cash).toLocaleString()}, ` +
            `position ${Math.round(marked).toLocaleString()} at mid of slows, total ${Math.round(l.cash + marked).toLocaleString()}, energy ${l.energy.toLocaleString()}`);
        lines.push(...rows);
        if (fills > 0) {
            for (const f of l.fills.slice(-fills)) {
                lines.push(`  ${f[0]} ${f[3].padEnd(7)} ${f[2]} ${String(f[7]).padStart(5)} ${f[1].padEnd(13)} @ ${f[6]} +${f[8]} ${f[5]} ${f[4]}`);
            }
        }
    }
    return lines.length ? lines.join("\n") : "no trader ledgers";
}
