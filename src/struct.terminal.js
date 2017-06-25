const shed = require('shed');
const lib = require('lib');

const kEnergyDelta = 10000;
const kEnergyMin = 10000;

class TerminalExtra {
  energyWant() {
    const e = this.store.energy;
    const m = this.storeTotal - e;
    if(m > 0) {
      return kEnergyMin + Math.ceil(m / 4);
    }
    return kEnergyMin;
  }

  energyFill() {
    const e = this.store.energy;
    const want = this.energyWant();
    return want > e;
  }

  energyDrain() {
    const e = this.store.energy;
    const want = this.energyWant();
    return e - want > kEnergyDelta;
  }

  run() {
    if(shed.med()) return console.log("shedding terminal");
    if(this.cooldown) return;

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
              return;
            }
          }
        }
      }
    }
  }
}

lib.merge(StructureTerminal, TerminalExtra);
