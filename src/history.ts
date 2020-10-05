import * as debug from "debug";
import { injecter } from "roomobj";
import { toXY } from "Rewalker";

type Summary = Record<string, HistoryEntry>;

type HistoryEntry = {
    recv?: number
    send?: number

    buy?: number
    bcost?: number
    btax?: number

    sell?: number
    scost?: number
    stax?: number
};

type Logs = Record<string, Summary>;
interface HistorySeg {
    start: string
    end: number
    players: Logs
    rooms: Logs
}

interface HistoryMemory {
    now: HistorySeg
    compact?: number
    prev: HistorySeg[][]
    lastIn: number
    lastOut: number
}

function getLog(logs: Logs, who: string, what: string): HistoryEntry {
    if (!logs[who]) {
        logs[who] = {};
    }
    if (!logs[who][what]) {
        logs[who][what] = {};
    }
    return logs[who][what];
}

let defaultMem: HistoryMemory;

interface Transactions {
    lastFetch: number
    minGap: number
    txs: Transaction[]
}

export class MarketHistory {
    static initMemory(memory: any): HistoryMemory {
        memory.lastIn = memory.lastIn || 0;
        memory.lastOut = memory.lastOut || 0;
        memory.now = this.initSegment(Object.create(null));
        memory.prev = [[]];
        return memory
    }

    static initSegment(seg: any): HistorySeg {
        seg.rooms = seg.room || Object.create(null);
        seg.players = seg.room || Object.create(null);
        seg.start = new Date().toJSON().substring(0, 10);
        return seg;
    }

    outs: Transactions;
    ins: Transactions;
    deficit = 0;
    totalCost = 0;
    constructor(public readonly username: string) {
        this.ins = {
            lastFetch: this.memory.lastIn,
            minGap: 100,
            txs: [],
        };
        this.outs = {
            lastFetch: this.memory.lastOut,
            minGap: 100,
            txs: [],
        };
    }

    get memory(): HistoryMemory {
        if (!defaultMem) {
            defaultMem = MarketHistory.initMemory({});
        }
        return defaultMem;
    }

    log(...args: any[]) { console.log(...args); }

    // maxCpu is pessimistic fair CPU usage. Unused allotment is lost, but deficit is retained and will prevent runs in the furture.
    run(maxCpu = 2) {
        const start = Game.cpu.getUsed();
        this.getTxs(this.ins, () => Game.market.incomingTransactions);
        this.getTxs(this.outs, () => Game.market.outgoingTransactions);

        const die = start + maxCpu - this.deficit;

        this.rotate(die);

        if (this.ins.txs.length > this.outs.txs.length) {
            this.recordIns(this.ins, die);
            this.recordOuts(this.outs, die);
        } else {
            this.recordOuts(this.ins, die);
            this.recordIns(this.outs, die);
        }

        this.compact(die);


        const end = Game.cpu.getUsed();
        const cost = end - start;
        this.totalCost += cost;
        this.deficit += end - die;
        if (this.deficit <= 0) this.deficit = 0;
    }

    getTxs(txs: Transactions, more: () => Transaction[]) {
        if (txs.lastFetch + txs.minGap >= Game.time) {
            let newtxs = more();
            const newestTime = _.first(newtxs).time;
            txs.minGap = Math.min(txs.minGap, newestTime - _.last(newtxs).time);

            const i = newtxs.findIndex(tx => tx.time >= txs.lastFetch);
            txs.lastFetch = newestTime;

            if (i >= 0) {
                newtxs = newtxs.slice(0, i);
            }
            newtxs.push(...txs.txs);
            txs.txs = newtxs;
        }
        if (txs.txs.length > 1000) {
            this.log(`Too many (${txs.txs.length}) unrecorded transactions!`);
            txs.txs = txs.txs.slice(0, 1000);
        }
    }

    merge(segs: HistorySeg[]): HistorySeg {
        function adder(sum: HistoryEntry, x: HistoryEntry) {
            // TODO

        }
        return segs.reduce((sum, add) => {
            for(const player in add.players) {
                if(!sum.players[player]) {
                    sum.players[player] = add.players[player];
                } else {
                    adder(sum.players[player], add.players[player]);
                }
            }
            for(const room in add.rooms) {
                if(!sum.rooms[room]) {
                    sum.rooms[room] = add.rooms[room];
                } else {
                    adder(sum.rooms[room], add.rooms[room]);
                }
            }
            if(sum.start >= add.start) {
                sum.start = add.start;
            }
            return sum;
        });
    }

    checkCompact(die: number) {
        if (Game.cpu.getUsed() > die) return;

        if (this.memory.compact) {
            if (!this.compact()) {
                delete this.memory.compact;
            }
        }
    }

    compact(fulltier = 3, size = 2) {
        for (let lvl = 0; lvl < this.memory.prev.length; lvl++) {
            const tier = this.memory.prev[lvl];
            if (tier.length < fulltier) continue;
            const tomerge = tier.slice(tier.length - size, tier.length);
            const merged = this.merge(tomerge);
            if (lvl + 1 >= this.memory.prev.length) {
                this.memory.prev.push([merged]);
            } else {
                this.memory.prev[lvl + 1].unshift(merged);
            }
            this.memory.prev[lvl] = tier.slice(0, tier.length - size)
            return true;
        }
        return false;
    }

    rotate(die: number, ticks = 20000) {
        if (Game.cpu.getUsed() > die) return;
        const now = this.memory.now;

        if (now.end > Game.time) return;
        this.memory.prev[0].unshift(this.memory.now);
        this.memory.compact = Game.time;
        this.memory.now = MarketHistory.initSegment({});
        this.memory.now.end = Math.round(ticks * _.random(0.9, 1.1));
    }


    recordIns(ins: Transactions, die: number) {
        if (!ins.txs.length) return 0;

        let recorded = 0;
        const sum = this.memory.now;

        while (Game.cpu.getUsed() < die) {
            let x: Transaction | undefined = ins.txs.pop()!;
            const current = x.time;
            while (x && x.time === current) {
                this.recordIn(sum, x);
                recorded++
                x = ins.txs.pop();
            }
            this.memory.lastIn = current;
        }
        return recorded;
    }

    recordOuts(outs: Transactions, die: number) {
        if (!outs.txs.length) return 0;

        let recorded = 0;
        const sum = this.memory.now;

        while (Game.cpu.getUsed() < die) {
            let x: Transaction | undefined = outs.txs.pop()!;
            const current = x.time;
            while (x && x.time === current) {
                this.recordOut(sum, x);
                recorded++
                x = outs.txs.pop();
            }
            this.memory.lastOut = current;
        }
        return recorded;
    }

    recordIn(sum: HistorySeg, x: Transaction) {
        const r = getLog(sum.rooms, x.to, x.resourceType);
        const who = x.sender?.username || 'npc';
        const p = getLog(sum.players, who, x.resourceType);
        if (!x.order) {
            if (who !== this.username) {
                this.recordTerm(r, p, x)
            } else {
                const s = getLog(sum.rooms, x.from, x.resourceType);
                this.recordTerm(r, s, x);
            }
        } else {
            this.recordMarket(r, p, x);
        }
    }

    recordOut(sum: HistorySeg, x: Transaction) {
        const s = getLog(sum.rooms, x.from, x.resourceType);
        const who = x.recipient?.username || 'npc';
        const p = getLog(sum.players, who, x.resourceType);

        if (!x.order) {
            // already recorded self txs during incoming
            if (who === this.username) return;

            this.recordTerm(p, s, x);
        } else {
            this.recordMarket(p, s, x);
        }
    }

    recordTerm(recver: HistoryEntry, sender: HistoryEntry, x: Transaction) {
        sender.send = (sender.send || 0) + x.amount;
        recver.recv = (recver.recv || 0) + x.amount;
    }

    recordMarket(recver: HistoryEntry, sender: HistoryEntry, x: Transaction) {
        const cost = Math.round(x.order!.price * x.amount);
        sender.sell = (sender.sell || 0) + x.amount;
        sender.scost = (sender.scost || 0) + cost;

        recver.buy = (recver.buy || 0) + x.amount;
        recver.bcost = (recver.bcost || 0) + cost;

        const tax = Game.market.calcTransactionCost(x.amount, x.to, x.from);
        if (x.order!.type === ORDER_BUY) {
            sender.stax = (sender.stax || 0) + tax
        } else {
            recver.btax = (recver.btax || 0) + tax
        }
    }
}

// interface HistoryMemory extends debug.DebugMemory {
//     now: HistorySeg
// }

// declare global {
//     interface Memory {
//         history: HistoryMemory
//     }
// }

// if(!Memory.history) {
//     Memory.history = MarketHistory.initMemory({});
// }

@injecter(debug.Debuggable)
class MyHistory extends MarketHistory {
    name = 'history';
}

export const history = new MyHistory('deft-code');