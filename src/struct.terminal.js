const shed = require('shed');
const lib = require('lib');
const debug = require('debug');

const kEnergyLow = 50000;
const kEnergyHi = 60000;
const kMaxMineral = 75000;

let gCache = {};

class TerminalExtra {
  energyFill() {
    return this.store.energy < kEnergyLow;
  }

  energyDrain() {
    return this.store.energy > kEnergyHi;
  }

  calc(resource) {
    if(gCache.time !== Game.time) {
      gCache = {
        time: Game.time,
        min: {},
        max: {},
      };
    }

    if(gCache[resource]) {
      return gCache[resource];
    }

    const orders = Game.market.getAllOrders({resourceType: resource});
    let mn = null;
    let mx = null;
    for(const order of orders) {
      if(order.amount < 100) continue;

      // Exclude my own orders
      if(Game.market.orders[order.id]) continue;

      if(order.type === ORDER_BUY) {
        if(!mx) {
          mx = order;
        } else if(mx.price < order.price) {
          mx = order;
        } else if(mx.price === order.price) {
          const mdist = Game.market.calcTransactionCost(1000, this.room.name, mx.roomName);
          const odist = Game.market.calcTransactionCost(1000, this.room.name, order.roomName);
          if(odist < mdist) {
            mx = order;
          }
        }
      } else {
        // Prevent wild sell orders from bankrupting me.
        if(order.price > 10) continue;

        if(!mn) {
          mn = order;
        } else if(mn.price > order.price) {
          mn = order;
        } else if(mn.price === order.price) {
          const mdist = Game.market.calcTransactionCost(1000, this.room.name, mn.roomName);
          const odist = Game.market.calcTransactionCost(1000, this.room.name, order.roomName);
          if(odist < mdist) {
            mn = order;
          }
        }
      }
    }

    return gCache[resource] = [mn && mn.id, mx && mx.id];
  }

  min(resource) {
    return Game.market.getOrderById(this.calc(resource)[0]);
  }

  max(resource) {
    return Game.market.getOrderById(this.calc(resource)[1]);
  }

  sell(resource, amount=1000) {
    const order = this.max(resource);
    if(!order) return order;
    const err = this.deal(order.id, Math.min(order.amount, amount));
    debug.log(`${this.room.name}:${err} sell ${JSON.stringify(order)}`);
    return err;
  }

  buy(resource, amount=1000) {
    const order = this.min(resource);
    if(!order) return order;
    const err = this.deal(order.id, Math.min(order.amount, amount));
    debug.log(`${this.room.name}:${err} buy ${JSON.stringify(order)}`);
    return err;
  }

  deal(id, amount=1000) {
    return Game.market.deal(id, amount, this.room.name);
  }

  buyOrder(resource, amount=10000) {
    const [mnid, mxid] = this.calc(resource);
    const mn = Game.market.getOrderById(mnid);
    const mx = Game.market.getOrderById(mxid);

    const price = Math.min(
      // Safety net never buy for more than 10.
      10 * 1000,
      Math.round(1000 * mx.price)+1,
      Math.round(1000 * mn.price));

    return this.order(ORDER_BUY, resource, price, amount);
  }

  sellOrder(resource, amount=10000) {
    const [mnid, mxid] = this.calc(resource);
    const mn = Game.market.getOrderById(mnid);
    const mx = Game.market.getOrderById(mxid);

    const mnp = Math.round(1000 * mn.price);

    const price = Math.min(
      10 * 1000,
      2 * mnp,
      Math.max(
        Math.round(1000 * mx.price),
        mnp - 1));

    debug.log(`sell order ${this.room} price:${price} mn:${mn.price}, mx:${mx.price}`);

    return this.order(ORDER_SELL, resource, price, amount);
  }

  order(type, resource, price, amount) {
    const myOrder = _.find(
      Game.market.orders,
      o =>
        o.roomName === this.room.name &&
        o.type === type &&
        o.resourceType === resource);

    if(myOrder) {
      const op = Math.round(myOrder.price * 1000);
      let err;
      if(op !== price) {
        err = Game.market.changeOrderPrice(myOrder.id, price/1000);
        debug.log(`Updating price:'${err}' to ${price} on ${JSON.stringify(myOrder)}`);
        if(err !== OK) {
          return err;
        }
      }
      if(2*myOrder.remainingAmount < amount) {
        err = Game.market.extendOrder(myOrder.id, amount - myOrder.remainingAmount);
        debug.log(`Updating amount:'${err}' to ${amount}: ${JSON.stringify(myOrder)}`);
        if(err !== OK) {
          return err;
        }
      }
      return err;
    } else {
      const err = Game.market.createOrder(type, resource, price/1000, amount, this.room.name);
      debug.log(`Creating order:'${err}' ${this}, ${resource}`);
      return err;
    }
    return;
  }

  run() {
    if(shed.med()) return; //console.log("shedding terminal");
    if(this.cooldown) return;
    return this.runBalance() ||
      this.runEnergy() ||
      this.runBuys();
  }

  runBalance() {
    const terminals = _.shuffle(_.map(_.filter(Game.rooms, r => r.terminal && r.terminal.my),'terminal'));
    const rs = _.shuffle(_.keys(this.store));
    for(const r of rs) {
      if(r === RESOURCE_ENERGY) continue;
      if(r === RESOURCE_POWER) continue;

      if(this.store[r] > 100) {
        const have = _.any(this.room.findStructs(STRUCTURE_LAB),
          l => l.planType === r);
        for(const terminal of terminals) {
          const q = terminal.store[r] || 0;
          if(!terminal.store[r]) {
            const need = _.any(terminal.room.findStructs(STRUCTURE_LAB),
              l => l.planType === r);
            if(!need) continue;
            let num = 0;
            if(this.store[r] >= 200) {
              num = Math.min(1000, Math.floor(this.store[r]/2));
            }
            if(this.store[r] < 200 && !have) {
              num = this.store[r];
            }
            if(num) {
              const err = this.send(r, num, terminal.room.name);
              console.log(`Terminal send ${err}: ${this.room.name} ${r}x${num} ${terminal.room.name}`);
              return terminal.room.name;
            }
          }
        }
        if(this.store[r] > kMaxMineral) {
          // TODO renable later
          //this.sellOrder(r);
          if(this.store.energy > 1000) {
            if(this.sell(r) === OK) {
              debug.log("auto sale!");
              return 'sell:' + r;
            }
          }
        }
      }
    }
    return false;
  }

  runEnergy() {
    const terminals = _.shuffle(_.map(_.filter(Game.rooms, r => r.terminal && r.terminal.my),'terminal'));
    const mySE = this.room.storage.store.energy;
    if(mySE > 100000 && this.store.energy > 20000) {
      for(const terminal of terminals) {
        const sE = terminal.room.storage.store.energy;
        if(terminal.storeFree > 50000 && (mySE - sE) > 50000) {
          const err = this.send(RESOURCE_ENERGY, 10000, terminal.room.name);
          debug.log('share energy', err, this.room, 'to', terminal.room);
          return terminal.room.name;
        }
      }
    }
    if(this.store.energy > 40000) {
      for(const terminal of terminals) {
        const sE = terminal.room.storage.store.energy;
        if(terminal.storeFree > 50000 && terminal.store.energy < 10000) {
          const err = this.send(RESOURCE_ENERGY, 10000, terminal.room.name);
          debug.log('low share energy', err, this.room, 'to', terminal.room);
          return terminal.room.name;
        }
      }
    }
    return false;
  }

  runBuys() {
    if(Game.market.credits < 100000) return false;

    const labs = _.shuffle(this.room.findStructs(STRUCTURE_LAB));
    for(const lab of labs) {
      if(!lab.planType) continue;
      if(lab.mineralType && lab.planType !== lab.mineralType) continue;
      if(lab.planType.length !== 1 || lab.planType === RESOURCE_GHODIUM) continue;
      if(this.store[lab.planType]) continue;
      if(lab.mineralAmount >= 5) continue;
      // TODO reenable later.
      //this.buyOrder(lab.planType);
      const err = this.buy(lab.planType);
      debug.log("autobuy", err, lab.room.name, lab.planType);
      if(err === OK) {
        return `autobuy:${lab.planType}:${this.room.name}`;
      }
    }
    return false;
  }
}

lib.merge(StructureTerminal, TerminalExtra);
