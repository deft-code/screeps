const shed = require('shed');
const lib = require('lib');
const debug = require('debug');

const kEnergyLow = 50000;
const kEnergyHi = 60000;

class TerminalExtra {

  energyFill() {
    return this.store.energy < kEnergyLow;
  }

  energyDrain() {
    return this.store.energy > kEnergyHi;
  }

  sell(resource, amount=1000) {
    const orders = Game.market.getAllOrders({resourceType: resource});
    const buys = _.filter(orders, o => o.type === ORDER_BUY && o.amount >= 100);
    const buy = _.max(buys, 'price');
    const err = this.deal(buy.id, Math.min(buy.amount, amount));
    debug.log(`${this.room.name}#(${buys.length}):${err} sell ${JSON.stringify(buy)}`);
    return err;
  }

  buy(resource, amount=1000) {
    const orders = Game.market.getAllOrders({resourceType: resource});
    const sells = _.filter(orders, o => o.type === ORDER_SELL && o.amount >= 100);
    const sell = _.min(sells, 'price');
    const err = this.deal(sell.id, Math.min(sell.amount, amount));
    debug.log(`${this.room.name}#(${sells.length}):${err} buy ${JSON.stringify(sell)}`);
    return err;
  }

  deal(id, amount=1000) {
    return Game.market.deal(id, amount, this.room.name);
  }

  run() {
    if(shed.med()) return; //console.log("shedding terminal");
    if(this.cooldown) return;
    return this.runBalance() ||
      this.runEnergy() ||
      this.runBuys();
  }

  runBalance() {
    const terminals = _.shuffle(_.map(_.filter(Game.rooms, 'terminal'),'terminal'));
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
        if(this.store[r] > 100000 && this.store.energy > 1000) {
          if(this.sell(r) === OK) {
            debug.log("auto sale!");
            return 'sell:' + r;
          }
        }
      }
    }
    return false;
  }

  runEnergy() {
    const terminals = _.shuffle(_.map(_.filter(Game.rooms, 'terminal'),'terminal'));
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
      const err = this.buy(lab.planType);
      if(err === OK) {
        debug.log("autobuy", err, lab.room.name, lab.planType);
        return `autobuy:${lab.planType}:${this.room.name}`;
      }
    }
    return false;
  }
}

lib.merge(StructureTerminal, TerminalExtra);
