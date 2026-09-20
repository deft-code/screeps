import { register, Priority, Service } from "process";
import * as debug from "debug";
import { marketDisabled } from "markethack";
import { tryGetBuyOrderPrice } from "market";

// Ticks a resource's buy-order list is reused before Game.market.getAllOrders
// (CPU-heavy) is asked again.
const kOrderCacheTicks = 50;
// Energy the terminal is topped up to (from the cheapest sell order) when a
// sale fails for lack of transfer energy.
const kEnergyTarget = 100000;
// Below this much terminal energy a tick buys energy before it tries to sell.
const kEnergyLow = 10000;
// Nothing is sold while the terminal holds less energy than this: twice what
// shipping 5000 units costs at worst. Shipping 5000 costs 1171 energy at 8
// rooms, 3161 at 30, 4201 at 55 (where most buyers were, Sept 2026) and
// approaches 5000 with distance.
const kSellAbove = 2 * 5000;
// Most energy one deal buys: a whole sell order up to this much.
const kBuyMax = 10000;
// While the terminal holds less energy than this, a standing energy buy order
// is kept at kBidAmount units remaining, 1 credit over the best bid of anyone
// else (sellers pay the transfer energy of a buy order, so it fills even when
// the terminal is empty and cannot deal).
const kBidBelow = 25000;
const kBidAmount = 10000;
const kBidStep = 1;
// Never bid more than this per unit, whatever the top bid is: two bots each
// outbidding the other by 1 would otherwise climb without limit.
const kMaxBid = 150;
// Ticks between looks at the bid. Shorter than the order cache, so the bid
// asks for an energy buy list no older than this: a sale every 10 ticks can
// burn 4k energy each, faster than a slow look would refill.
const kBidPace = 10;

interface SelloffMemory {
    // Id of the energy buy order this room's Selloff manages.
    bid?: string
}

declare global {
    interface Memory {
        selloff?: { [roomName: string]: SelloffMemory }
    }
}

interface OrderCache {
    tick: number
    orders: Order[]
}
const orderCache = new Map<string, OrderCache>();

// Open orders of one type for `res`, best price for us first (highest buy,
// lowest sell); cached per type and resource.
function marketOrders(type: ORDER_BUY | ORDER_SELL, res: ResourceConstant, maxAge = kOrderCacheTicks): Order[] {
    const key = type + res;
    const hit = orderCache.get(key);
    if (hit && Game.time - hit.tick < maxAge) return hit.orders;
    const orders = _.sortBy(
        Game.market.getAllOrders({ type, resourceType: res }).filter(o => o.remainingAmount > 0 && o.price > 0),
        o => type === ORDER_BUY ? -o.price : o.price);
    orderCache.set(key, { tick: Game.time, orders });
    return orders;
}

// Transfer energy per unit shipped between two rooms (0..1, by distance).
function transferRate(roomA: string, roomB: string): number {
    return Game.market.calcTransactionCost(10000, roomA, roomB) / 10000;
}

// Largest amount, at most `amount`, whose transfer energy this terminal can pay.
function affordable(term: StructureTerminal, amount: number, otherRoom: string): number {
    const room = term.room.name;
    const rate = transferRate(room, otherRoom);
    if (rate > 0) amount = Math.min(amount, Math.floor(term.store.energy / rate));
    // The cost is rounded up per deal, so the estimate can be a unit or two over.
    while (amount > 0 && Game.market.calcTransactionCost(amount, room, otherRoom) > term.store.energy) amount--;
    return Math.max(amount, 0);
}

// Energy sell orders, cheapest first by what a unit costs once it has
// arrived: the buyer pays the transfer in energy, so of every unit bought only
// 1 - rate is gained and the real price is price / (1 - rate). Sorted once per
// cached order list.
const byNetPrice = new WeakMap<Order[], Order[]>();
function energySellers(room: string): Order[] {
    const orders = marketOrders(ORDER_SELL, RESOURCE_ENERGY);
    let sorted = byNetPrice.get(orders);
    if (!sorted) {
        sorted = _.sortBy(orders, o => netPrice(o, room));
        byNetPrice.set(orders, sorted);
    }
    return sorted;
}

function netPrice(order: Order, room: string): number {
    const rate = transferRate(room, order.roomName!);
    return rate < 1 ? order.price / (1 - rate) : Infinity;
}

// Is a buy order worth its shipping? We pay the transfer in energy, `rate`
// energy per unit sold, and that energy would itself sell at the energy
// buy-order price; an order paying less per unit than that burns more than it
// earns. Nothing passes while energy has no buy-order price (-Infinity: the
// book cannot be read), since the shipping cannot be valued then.
function worthShipping(order: Order, room: string): boolean {
    const energy = tryGetBuyOrderPrice(RESOURCE_ENERGY, room);
    if (!(energy > 0)) return false;
    return order.price >= transferRate(room, order.roomName!) * energy;
}

type SellResult = "sold" | "noEnergy" | false;

// Sell a room's terminal stock (everything but energy) into market buy orders.
//
//   scheduleService('Selloff W3N4')   // args[1]=room with a terminal
//
// A plain Service (no creeps), so a purple flag "Selloff_W3N4" may run it.
// Kills itself (and deschedules) when the room is not ours or has no terminal.
// Each tick the terminal is off cooldown: shuffle the terminal's non-energy
// resources, and for each walk the cached buy orders (best price first) until
// Game.market.deal succeeds, skipping any order that pays less per unit than
// its shipping energy is worth (worthShipping). One deal per tick: deal() puts the
// terminal on its TERMINAL_COOLDOWN (10 ticks) like send() does. The transfer
// energy is paid by this terminal, so the amount is cut to what it can pay; when
// even one unit does not fit, the tick's deal is instead buying energy from the
// cheapest sell order, up to kEnergyTarget in the terminal. The same buy comes
// first whenever the terminal holds under kEnergyLow energy; when it cannot be
// made (the buyer pays transfer energy too, so an empty terminal cannot deal)
// the tick ends there: nothing is sold under kSellAbove energy, so the little
// there is goes to buying energy rather than to shipping a sale.
//
// Independent of the cooldown, every kBidPace ticks while the terminal holds
// under kBidBelow energy, bidEnergy() keeps one energy buy order for the room.
// Its id lives in Memory.selloff[room].bid and the order is reused from then
// on (an order of ours already standing for the room is adopted rather than a
// new one created; createOrder does not return the id, so a new order is
// adopted the same way on the next look). Price: kBidStep over the best bid
// that is not ours, capped at kMaxBid; raised whenever that is higher, lowered
// only once the order has filled completely, held while the best bid is ours.
// Amount: extended back to kBidAmount remaining on every look, filled or not;
// overshooting kBidBelow as the order fills out is intended.
//
// Kills itself where the game has no market (the season shard).
@register
export class Selloff extends Service {
    lastDeal = "";
    lastBid = "";
    nextBid = 0;

    get memory(): SelloffMemory {
        const all = Memory.selloff = Memory.selloff || {};
        return all[this.roomName] = all[this.roomName] || {};
    }

    get roomName(): string {
        return this.args[1];
    }

    get room(): Room | undefined {
        return Game.rooms[this.roomName];
    }

    run(): Priority {
        if (marketDisabled()) {
            debug.log(this.name, "no market on", Game.shard.name, "- killing");
            this.kill();
            return "kill";
        }
        const room = this.room;
        const term = room?.terminal;
        if (!room?.controller?.my || !term?.my) {
            debug.log(this.name, "room not ours or no terminal in", this.roomName, "- killing");
            this.kill();
            return "kill";
        }
        this.bidEnergy(term);
        if (term.cooldown) return "low";
        if (term.store.energy < kEnergyLow && this.buyEnergy(term)) return "low";
        if (term.store.energy < kSellAbove) return "low";

        const stock = (Object.keys(term.store) as ResourceConstant[])
            .filter(res => res !== RESOURCE_ENERGY && term.store[res] > 0);
        // Random order so no single unsellable resource hogs every attempt.
        for (const res of _.shuffle(stock)) {
            const ret = this.sell(term, res);
            if (ret === "sold") break;
            if (ret === "noEnergy") {
                this.buyEnergy(term);
                break;
            }
        }
        return "low";
    }

    // First buy order for `res` this terminal can fill (fully or in part).
    // "noEnergy" when the terminal cannot pay the transfer for even one unit.
    sell(term: StructureTerminal, res: ResourceConstant): SellResult {
        const have = term.store[res];
        for (const order of marketOrders(ORDER_BUY, res)) {
            // Used up by our earlier deals (the cached list is decremented as
            // we sell); not a shortage of energy.
            if (order.remainingAmount <= 0) continue;
            // Best price first, but a lower bid next door can still pay.
            if (!worthShipping(order, term.room.name)) continue;
            const amount = affordable(term, Math.min(have, order.remainingAmount), order.roomName!);
            if (amount <= 0) {
                debug.log(this.name, "not enough energy to ship", res, "to", order.roomName);
                return "noEnergy";
            }
            const err = Game.market.deal(order.id, amount, term.room.name);
            if (err === OK) {
                this.lastDeal = `${amount} ${res} @${order.price} -> ${order.roomName} (t${Game.time})`;
                debug.log(this.name, "sold", this.lastDeal);
                order.remainingAmount -= amount;
                return "sold";
            }
            debug.log(this.name, "deal failed", err, amount, res, "to", order.roomName);
        }
        return false;
    }

    // Buy energy from the sell order that is cheapest per unit gained (see
    // energySellers), skipping any over kMaxBid per unit gained: the whole
    // order up to kBuyMax, less when the terminal is nearly at kEnergyTarget,
    // our credits run short, or (the usual limit) the energy on hand cannot
    // pay the transfer, which the buyer owes too. At the ~0.8 rate of the far
    // corners where cheap energy is sold, E energy on hand buys E / 0.8 units.
    buyEnergy(term: StructureTerminal): boolean {
        const want = Math.min(kBuyMax, kEnergyTarget - term.store.energy);
        if (want <= 0) return false;
        for (const order of energySellers(term.room.name)) {
            if (order.remainingAmount <= 0) continue;
            const net = netPrice(order, term.room.name);
            if (net > kMaxBid) {
                debug.log(this.name, "energy from", order.roomName, "@", order.price, "is", Math.round(net), "per unit gained, over", kMaxBid);
                return false;
            }
            const byCredits = Math.floor(Game.market.credits / order.price);
            const amount = affordable(term, Math.min(want, order.remainingAmount, byCredits), order.roomName!);
            if (amount <= 0) {
                debug.log(this.name, "cannot buy energy from", order.roomName, "@", order.price, "credits", Game.market.credits);
                return false;
            }
            const err = Game.market.deal(order.id, amount, term.room.name);
            if (err === OK) {
                this.lastDeal = `bought ${amount} energy @${order.price} (${Math.round(net)} net) <- ${order.roomName} (t${Game.time})`;
                debug.log(this.name, this.lastDeal);
                order.remainingAmount -= amount;
                return true;
            }
            debug.log(this.name, "energy buy failed", err, amount, "from", order.roomName);
        }
        return false;
    }

    // The energy buy order this service manages: the remembered one while it
    // exists, else the best-priced energy buy order we hold for this room.
    myBid(): Order | undefined {
        const mem = this.memory;
        let bid: Order | undefined = mem.bid ? Game.market.orders[mem.bid] : undefined;
        if (!bid) {
            bid = _.last(_.sortBy(_.filter(Game.market.orders, o => o.type === ORDER_BUY &&
                o.resourceType === RESOURCE_ENERGY && o.roomName === this.roomName), o => o.price));
            if (bid) debug.log(this.name, "adopting energy buy order", bid.id, "@", bid.price);
        }
        if (bid) mem.bid = bid.id;
        else delete mem.bid;
        return bid;
    }

    // Keep the standing energy buy order; see the header.
    bidEnergy(term: StructureTerminal) {
        if (Game.time < this.nextBid || term.store.energy >= kBidBelow) return;
        this.nextBid = Game.time + kBidPace;

        const mine = this.myBid();
        const top = _.first(marketOrders(ORDER_BUY, RESOURCE_ENERGY, kBidPace));
        const topIsOurs = !!top && !!Game.market.orders[top.id];
        // The price to be at: over the best foreign bid, else where we are.
        let want = mine ? mine.price : 0;
        if (top && !topIsOurs) want = Math.min(top.price + kBidStep, kMaxBid);
        if (want <= 0) {
            debug.log(this.name, "no energy bids to price against, not bidding");
            return;
        }

        if (!mine) {
            const err = Game.market.createOrder({
                type: ORDER_BUY, resourceType: RESOURCE_ENERGY, price: want,
                totalAmount: kBidAmount, roomName: this.roomName,
            });
            this.lastBid = `created ${kBidAmount} @${want}: ${err} (t${Game.time})`;
            debug.log(this.name, "energy bid", this.lastBid);
            return;
        }

        const filled = mine.remainingAmount <= 0;
        let price = mine.price;
        if (want > price || (want < price && filled)) {
            const err = Game.market.changeOrderPrice(mine.id, want);
            debug.log(this.name, "energy bid", mine.id, "price", price, "->", want, "top", top && top.price, err);
            if (err === OK) price = want;
        }
        // Always back to the full amount: the order keeps filling after the
        // terminal passes kBidBelow, and that overshoot is wanted (energy at
        // the bid price, seller pays the transfer, beats any deal).
        const add = kBidAmount - mine.remainingAmount;
        if (add > 0) {
            const err = Game.market.extendOrder(mine.id, add);
            debug.log(this.name, "energy bid", mine.id, "extended by", add, err);
        }
        this.lastBid = `${mine.id} @${price} rem:${mine.remainingAmount}+${Math.max(add, 0)} (t${Game.time})`;
    }

    status(): string {
        const term = this.room?.terminal;
        const stock = term ? ` stock:${term.store.getUsedCapacity() - term.store.energy}` : " stock:?";
        const cd = term ? ` cooldown:${term.cooldown}` : "";
        return super.status() + stock + cd + (this.lastDeal ? ` last:${this.lastDeal}` : "") +
            (this.lastBid ? ` bid:${this.lastBid}` : "");
    }
}
