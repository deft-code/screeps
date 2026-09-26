import { register, Priority, Service } from "process";
import * as debug from "debug";

// Smallest energy gap between the fullest and emptiest terminal that is
// worth a send; half the gap goes.
const kMinGap = 5000;
// Ticks between "no terminal" log lines.
const kLogPace = 100;

declare global {
    interface Memory {
        balance?: {
            // Rooms whose terminals share energy (addRoom / removeRoom).
            rooms: string[]
        }
    }
}

// "Balance": level energy across the terminals of the rooms it has been
// given. Every tick that none of those terminals is on cooldown, the one
// holding the most energy sends half of the gap to the one holding the
// least, when the gap is at least kMinGap. The send and its transfer fee
// both come out of the sender, so the amount shrinks to what it can pay.
//
//   scheduleService('Balance')
//   getService('Balance').addRooms('W26S8', 'W25S7')
//   getService('Balance').addRoom('W27S5')
//   getService('Balance').removeRoom('W25S7')
//
// Rooms without vision or without a terminal we own are skipped (logged
// every kLogPace ticks), so a room may be added before its terminal stands.
@register
export class Balance extends Service {
    get memory(): NonNullable<Memory["balance"]> {
        return Memory.balance = Memory.balance || { rooms: [] };
    }

    get rooms(): string[] {
        return this.memory.rooms;
    }

    addRoom(roomName: string): string[] {
        if (!_.contains(this.rooms, roomName)) this.rooms.push(roomName);
        return this.rooms;
    }

    addRooms(...roomNames: string[]): string[] {
        for (const name of roomNames) this.addRoom(name);
        return this.rooms;
    }

    removeRoom(roomName: string): string[] {
        _.pull(this.rooms, roomName);
        return this.rooms;
    }

    // Our terminal in each listed room that is visible and has one.
    terminals(): StructureTerminal[] {
        const terms: StructureTerminal[] = [];
        for (const name of this.rooms) {
            const term = Game.rooms[name]?.terminal;
            if (term?.my) {
                terms.push(term);
            } else if (Game.time % kLogPace === 0) {
                debug.log(this.name, "no terminal of ours in", name);
            }
        }
        return terms;
    }

    // Largest amount, at most `amount`, that `term` can send to `dest` with
    // the transfer fee paid from the same energy; the fee falls with the
    // amount, so a few passes settle it.
    affordable(term: StructureTerminal, amount: number, dest: string): number {
        const energy = term.store.energy;
        const cost = (n: number) => Game.market.calcTransactionCost(n, term.room.name, dest);
        for (let i = 0; i < 8 && amount >= TERMINAL_MIN_SEND && amount + cost(amount) > energy; i++) {
            amount = Math.min(amount, energy - cost(amount));
        }
        return amount >= TERMINAL_MIN_SEND ? amount : 0;
    }

    run(): Priority {
        const terms = this.terminals();
        if (terms.length < 2) return "low";
        if (_.any(terms, t => t.cooldown > 0)) return "low";

        const high = _.max(terms, t => t.store.energy);
        const low = _.min(terms, t => t.store.energy);
        const gap = high.store.energy - low.store.energy;
        if (gap < kMinGap) return "low";

        const dest = low.room.name;
        const want = Math.min(Math.floor(gap / 2), low.store.getFreeCapacity(RESOURCE_ENERGY));
        const amount = this.affordable(high, want, dest);
        if (!amount) {
            debug.log(this.name, high.room.name, "cannot afford to send", want, "to", dest);
            return "low";
        }
        const err = high.send(RESOURCE_ENERGY, amount, dest, this.name);
        if (err !== OK) {
            debug.log(this.name, "send failed", err, amount, high.room.name, "->", dest);
        } else {
            debug.log(this.name, "sent", amount, high.room.name, "->", dest, "gap was", gap);
        }
        return "low";
    }

    status(): string {
        const levels = this.rooms.map(name => {
            const term = Game.rooms[name]?.terminal;
            return `${name}:${term?.my ? term.store.energy : "-"}`;
        });
        return super.status() + " terminals " + (levels.join(",") || "none");
    }
}
