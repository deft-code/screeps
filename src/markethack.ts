import * as debug from "debug";

// Drop-in replacements for Game.market.getAllOrders and getOrderById that skip
// the engine's deep copy of the order book.
//
//   import { getAllOrders, getOrderById } from "markethack";
//   getAllOrders({ type: ORDER_BUY, resourceType: RESOURCE_ENERGY })
//
// Why it works: the engine keeps every open order in one plain object inside
// this VM, prices in milli-credits, and the API answers each first call of a
// tick with JSON.parse(JSON.stringify(table)) (3.5-4.5 CPU for the 1500
// orders of Sept 2026). getOrderById(id) starts with a bare `table[id]`, so a
// getter on Object.prototype under a private Symbol, asked for by
// getOrderById(thatSymbol), runs with `this` = the raw table. The engine sees
// `false`, returns null and copies nothing. MMO looks the id up in our own
// orders first, so the getter fires twice and the largest object wins.
//
// The raw table is engine state: it is never handed out by the wrappers and
// never written. They return shallow copies (orders are flat) with the price
// in credits, made once per tick per order and shared by every call of that
// tick, the way the engine shares its per-tick copy: `order.remainingAmount -=
// n` after a deal is seen by later callers. Differences from the API: a
// function filter gets (order, index) rather than (order, id), the order of
// the result is by resource, and an unknown resourceType gives [] not {}.
//
// When the capture finds nothing, or what it finds does not look like the
// order table, the call goes to Game.market instead; the capture is retried
// next tick. The first table captured after a global reset is checked against
// the API (price / 1000 and the other fields of one order); a mismatch, or a
// throw from the engine, turns the hack off until the next reset. status()
// says which path calls have taken.
//
// Costs, 1500 orders: capture 0.2-0.3 CPU per tick, then roughly a third of
// the API for a whole-book query. A query for one resource is NOT cheaper
// than the API (0.1-0.6, the engine keeps per-resource tables) until a tick
// asks for several. getOrderById costs 0.02-0.05 in the API, less than a
// capture, so it reads the raw table only when the tick has one already.

// Shards whose market the game has switched off (the seasonal server has no
// orders, credits or history). Nothing here touches the engine on those: no
// getter is installed and every call answers empty.
const kNoMarketShards = ["shardSeason"];

export function marketDisabled(): boolean {
    return _.contains(kNoMarketShards, Game.shard.name);
}

// An order as the engine holds it: the public shape, price in milli-credits.
type RawOrder = Order;
type RawTable = { [id: string]: RawOrder };
type Filter = OrderFilter | ((o: Order) => boolean);

const kAll = "all";
const hackingKey = Symbol("markethack");

let capturing = false;
let captured: RawTable | null = null;
let capturedSize = 0;

export function enable() {
    Object.defineProperty(Object.prototype, hackingKey, {
        configurable: true,
        enumerable: false,
        get(this: RawTable) {
            if (!capturing) return false;
            const n = _.size(this);
            if (n > capturedSize) {
                captured = this;
                capturedSize = n;
            }
            return false;
        },
    });
}

export function disable() {
    delete (Object.prototype as any)[hackingKey];
}

if (!marketDisabled()) enable();

// Set when the engine no longer behaves as described above; API only from
// then on. Module state, so a global reset tries again.
let broken = "";
let verified = false;
const stats = { hack: 0, api: 0 };

interface TickState {
    time: number
    raw: RawTable | null
    // Raw orders by resource type, then this tick's copies of them.
    buckets?: Map<string, RawOrder[]>
    views: Map<string, Order[]>
}
let state: TickState | undefined;

function tickState(): TickState {
    if (!state || state.time !== Game.time) {
        state = { time: Game.time, raw: capture(), views: new Map() };
    }
    return state;
}

function capture(): RawTable | null {
    if (broken || marketDisabled()) return null;
    captured = null;
    capturedSize = 0;
    capturing = true;
    try {
        Game.market.getOrderById(hackingKey as any);
    } catch (err) {
        giveUp(`getOrderById(symbol) threw ${err}`);
    } finally {
        capturing = false;
    }
    const raw = captured as RawTable | null;
    captured = null;
    if (broken || !raw) return null;
    const sample = raw[firstKey(raw)!];
    if (!looksLikeOrder(sample)) return null;
    if (!verified) {
        const why = mismatch(sample);
        if (why) {
            giveUp(why);
            return null;
        }
        verified = true;
    }
    return raw;
}

function giveUp(why: string) {
    broken = why;
    debug.warn("markethack off until the next global reset:", why);
}

function firstKey(obj: object): string | undefined {
    for (const key in obj) return key;
    return undefined;
}

function looksLikeOrder(o: RawOrder | undefined): boolean {
    return !!o && typeof o === "object" && typeof o.id === "string" &&
        typeof o.price === "number" && typeof o.resourceType === "string" &&
        (o.type === ORDER_BUY || o.type === ORDER_SELL);
}

// What the API says about a raw order that our reading of it gets wrong; ""
// when they agree.
function mismatch(raw: RawOrder): string {
    const api = Game.market.getOrderById(raw.id);
    if (!api) return `API does not know raw order ${raw.id}`;
    const mine = toPublic(raw);
    for (const key of _.union(_.keys(api), _.keys(mine)) as (keyof Order)[]) {
        if (api[key] !== mine[key]) return `order ${raw.id} ${key}: API ${api[key]} raw ${mine[key]}`;
    }
    return "";
}

function toPublic(raw: RawOrder): Order {
    const order = Object.assign({}, raw);
    order.price /= 1000;
    return order;
}

function buckets(s: TickState): Map<string, RawOrder[]> {
    if (s.buckets) return s.buckets;
    const map = new Map<string, RawOrder[]>();
    for (const raw of Object.values(s.raw!)) {
        const bucket = map.get(raw.resourceType);
        if (bucket) bucket.push(raw);
        else map.set(raw.resourceType, [raw]);
    }
    return s.buckets = map;
}

// This tick's copies for one resource type, or for kAll every resource's
// copies (the same objects) in one array.
function view(s: TickState, key: string): Order[] {
    let orders = s.views.get(key);
    if (orders) return orders;
    if (key === kAll) {
        orders = [];
        for (const res of buckets(s).keys()) {
            for (const order of view(s, res)) orders.push(order);
        }
    } else {
        orders = (buckets(s).get(key) || []).map(toPublic);
    }
    s.views.set(key, orders);
    return orders;
}

// The engine's raw order table for this tick (READ ONLY, prices in
// milli-credits), or null when the hack found nothing.
export function getRawMarket(): RawTable | null {
    return tickState().raw;
}

// Game.market.getAllOrders.
export function getAllOrders(filter?: Filter): Order[] {
    if (marketDisabled()) return [];
    const s = tickState();
    if (!s.raw) {
        stats.api++;
        return Game.market.getAllOrders(filter);
    }
    stats.hack++;
    const res = _.isPlainObject(filter) && (filter as OrderFilter).resourceType;
    return _.filter(view(s, res || kAll), filter as any);
}

// Game.market.getOrderById. A fresh copy per call, like the API.
export function getOrderById(id: string): Order | null {
    if (marketDisabled()) return null;
    // Never worth a capture of its own, see the header.
    const raw = state && state.time === Game.time && state.raw;
    if (!raw) {
        stats.api++;
        return Game.market.getOrderById(id);
    }
    stats.hack++;
    const order = raw[id];
    return looksLikeOrder(order) ? toPublic(order) : null;
}

export function status(): string {
    if (marketDisabled()) return `markethack: no market on ${Game.shard.name}`;
    const raw = state && state.time === Game.time && state.raw;
    return `markethack: ${broken ? "OFF (" + broken + ")" : verified ? "verified" : "unverified"}` +
        ` calls hack:${stats.hack} api:${stats.api}` +
        (raw ? ` orders:${_.size(raw)}` : "");
}
