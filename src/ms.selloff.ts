import { register, Priority, Service } from "process";
import * as debug from "debug";

// Ticks a resource's buy-order list is reused before Game.market.getAllOrders
// (CPU-heavy) is asked again.
const kOrderCacheTicks = 50;
// Energy the terminal is topped up to (from the cheapest sell order) when a
// sale fails for lack of transfer energy.
const kEnergyTarget = 100000;
// Below this much terminal energy a tick buys energy before it tries to sell.
const kEnergyLow = 10000;

interface OrderCache {
    tick: number
    orders: Order[]
}
const orderCache = new Map<string, OrderCache>();

// Open orders of one type for `res`, best price for us first (highest buy,
// lowest sell); cached per type and resource.
function marketOrders(type: ORDER_BUY | ORDER_SELL, res: ResourceConstant): Order[] {
    const key = type + res;
    const hit = orderCache.get(key);
    if (hit && Game.time - hit.tick < kOrderCacheTicks) return hit.orders;
    const orders = _.sortBy(
        Game.market.getAllOrders({ type, resourceType: res }).filter(o => o.remainingAmount > 0 && o.price > 0),
        o => type === ORDER_BUY ? -o.price : o.price);
    orderCache.set(key, { tick: Game.time, orders });
    return orders;
}

// Largest amount (halving from `amount`) whose transfer energy this terminal can pay.
function affordable(term: StructureTerminal, amount: number, otherRoom: string): number {
    while (amount > 0 && Game.market.calcTransactionCost(amount, term.room.name, otherRoom) > term.store.energy) {
        amount = Math.floor(amount / 2);
    }
    return amount;
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
// Game.market.deal succeeds. One deal per tick: deal() puts the
// terminal on its TERMINAL_COOLDOWN (10 ticks) like send() does. The transfer
// energy is paid by this terminal, so the amount is halved until it fits; when
// even one unit does not fit, the tick's deal is instead buying energy from the
// cheapest sell order, up to kEnergyTarget in the terminal. The same buy comes
// first whenever the terminal holds under kEnergyLow energy; when it cannot be
// made (the buyer pays transfer energy too, so an empty terminal cannot deal)
// the tick falls through to selling.
@register
export class Selloff extends Service {
    lastDeal = "";

    get roomName(): string {
        return this.args[1];
    }

    get room(): Room | undefined {
        return Game.rooms[this.roomName];
    }

    run(): Priority {
        const room = this.room;
        const term = room?.terminal;
        if (!room?.controller?.my || !term?.my) {
            debug.log(this.name, "room not ours or no terminal in", this.roomName, "- killing");
            this.kill();
            return "kill";
        }
        if (term.cooldown) return "low";
        if (term.store.energy < kEnergyLow && this.buyEnergy(term)) return "low";

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

    // Buy energy from the cheapest sell order: up to kEnergyTarget in the
    // terminal, what the order has, what our credits cover, and what the
    // transfer energy on hand allows (the buyer pays that too).
    buyEnergy(term: StructureTerminal): boolean {
        const want = kEnergyTarget - term.store.energy;
        if (want <= 0) return false;
        for (const order of marketOrders(ORDER_SELL, RESOURCE_ENERGY)) {
            const byCredits = Math.floor(Game.market.credits / order.price);
            const amount = affordable(term, Math.min(want, order.remainingAmount, byCredits), order.roomName!);
            if (amount <= 0) {
                debug.log(this.name, "cannot buy energy from", order.roomName, "@", order.price, "credits", Game.market.credits);
                return false;
            }
            const err = Game.market.deal(order.id, amount, term.room.name);
            if (err === OK) {
                this.lastDeal = `bought ${amount} energy @${order.price} <- ${order.roomName} (t${Game.time})`;
                debug.log(this.name, this.lastDeal);
                order.remainingAmount -= amount;
                return true;
            }
            debug.log(this.name, "energy buy failed", err, amount, "from", order.roomName);
        }
        return false;
    }

    status(): string {
        const term = this.room?.terminal;
        const stock = term ? ` stock:${term.store.getUsedCapacity() - term.store.energy}` : " stock:?";
        const cd = term ? ` cooldown:${term.cooldown}` : "";
        return super.status() + stock + cd + (this.lastDeal ? ` last:${this.lastDeal}` : "");
    }
}
