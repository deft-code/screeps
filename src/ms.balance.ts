import { register, Priority, Service } from "process";
import * as debug from "debug";

// Smallest energy gap between the fullest and emptiest terminal that is
// worth a send; half the gap goes.
const kMinGap = 5000;
// Ticks between "no terminal" and "holding" log lines.
const kLogPace = 100;
// Every RCL8 room is brought up to this much of each base mineral (terminal
// + storage) by the RCL8 room holding the most of it, which keeps this much
// itself.
const kBaseFloor = 10000;
const kBaseMinerals: ResourceConstant[] = [
    RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM,
    RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST,
];
// The catalyzed boosts (tier 3) the RCL8 rooms level among themselves
// (shareBoosts, since 31 Oct 2026): the room holding the most of one sends
// the room holding the least a kBoostShare-th of the difference when it
// holds kBoostRatio times as much and at least kBoostGap more. The gap
// makes the share at least TERMINAL_MIN_SEND.
const kBoosts: ResourceConstant[] = [
    RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
    RESOURCE_CATALYZED_KEANIUM_ACID, RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
    RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
    RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
    RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
];
const kBoostRatio = 2;
const kBoostGap = 3 * TERMINAL_MIN_SEND;
const kBoostShare = 3;
// Where every terminal's thorium goes when neither Memory.balance.thorium
// nor a scheduled ReactorDepot mission (its home room, ms.reactordepot.ts)
// says otherwise.
const kThoriumRoom = "W25S7";
// RCL at which a room has labs and shares base minerals with its peers.
const kLabRCL = 8;

declare global {
    interface Memory {
        balance?: {
            // Rooms whose terminals share energy and minerals (addRoom / removeRoom).
            rooms: string[]
            // Room every other terminal sends its thorium to (setThoriumRoom);
            // kThoriumRoom when unset.
            thorium?: string
            // The single mineral room of before 27 Oct 2026; deleted on sight.
            minerals?: string
        }
    }
}

// "Balance": energy and minerals between the terminals of the rooms it has
// been given (docs/balance-design.md). Each tick every listed terminal off
// cooldown makes at most one send, the first rule that applies:
//
//   1. thorium: all of it to the thorium room (every room but that one);
//   2. a room under RCL8 (no labs): one non-energy resource to the nearest
//      RCL8 terminal in the list, only what it holds more of than that room
//      (terminal + storage, Balance.stock), at most the gap;
//   3. an RCL8 room: a base mineral it holds the most of among the RCL8
//      rooms and more than kBaseFloor of, to the RCL8 room holding the
//      least of it while that is under the floor; the donor keeps the floor;
//   4. an RCL8 room: a catalyzed boost (kBoosts) it holds the most of among
//      the RCL8 rooms, kBoostRatio times the least holder's stock and
//      kBoostGap more, to that holder: a kBoostShare-th of the difference.
//
// Every send is capped by the destination's room and by what the sender's
// energy pays the fee on; a partial send that would strand under
// TERMINAL_MIN_SEND goes whole when it can, else waits. Then the fullest
// terminal off cooldown that did not send this tick sends half the energy
// gap to the emptiest listed one when the gap is kMinGap or more.
//
//   scheduleService('Balance')
//   getService('Balance').addRooms('W26S8', 'W25S7')
//   getService('Balance').addRoom('W27S5')
//   getService('Balance').removeRoom('W25S7')
//   getService('Balance').setThoriumRoom('W25S7')   // no argument: back to the default
//   getService('Balance').stocks()                  // base minerals per RCL8 room
//   getService('Balance').boosts()                  // catalyzed boosts per RCL8 room
//
// Rooms without vision, without a terminal we own, or whose terminal is
// inactive (an unclaimed room keeps our structures: W27S5, Oct 2026; a send
// into such a terminal destroys the energy) are skipped (logged every
// kLogPace ticks), so a room may be added before its terminal stands.
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

    // The thorium room: the console override, else the home of the scheduled
    // ReactorDepot (the terminal its warrunners load from), else kThoriumRoom.
    get thoriumRoom(): string {
        if (this.memory.thorium) return this.memory.thorium;
        const depot = _.find(Memory.scheduler?.services || [], s => /^ReactorDepot /.test(s));
        return depot ? depot.split(" ")[1] : kThoriumRoom;
    }

    // Console: the room that collects thorium; no argument restores the default.
    setThoriumRoom(roomName: string | null = null): string {
        if (roomName) this.memory.thorium = roomName;
        else delete this.memory.thorium;
        return this.thoriumRoom;
    }

    // Our active terminal in each listed room that is visible and has one.
    terminals(): StructureTerminal[] {
        const terms: StructureTerminal[] = [];
        for (const name of this.rooms) {
            const term = Game.rooms[name]?.terminal;
            if (term?.my && term.isActive()) {
                terms.push(term);
            } else if (Game.time % kLogPace === 0) {
                debug.log(this.name, term?.my ? "inactive terminal in" : "no terminal of ours in", name);
            }
        }
        return terms;
    }

    static isLabRoom(term: StructureTerminal): boolean {
        return (term.room.controller?.level || 0) >= kLabRCL;
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

    // What a room holds of `res` in its terminal and storage.
    static stock(room: Room, res: ResourceConstant): number {
        return (room.terminal?.store[res] || 0) + (room.storage?.store[res] || 0);
    }

    // Send up to `amount` of `res` from `term` to `dest`: capped by the
    // destination's room and the fee the sender's energy covers, never
    // under TERMINAL_MIN_SEND, and never a partial send that would strand
    // under TERMINAL_MIN_SEND behind (that remainder could never ship by
    // itself): the lot goes instead when it fits and the fee covers it,
    // else the terminal holds until it can. True when it went.
    ship(term: StructureTerminal, res: ResourceConstant, amount: number, dest: StructureTerminal, why: string): boolean {
        const have = term.store[res] || 0;
        const to = dest.room.name;
        const room = dest.store.getFreeCapacity(res) || 0;
        const fee = (n: number) => Game.market.calcTransactionCost(n, term.room.name, to);
        amount = Math.min(amount, have, room);
        if (amount < have && have - amount < TERMINAL_MIN_SEND && have <= room && fee(have) <= term.store.energy) amount = have;
        const cost = fee(amount);
        if (cost > term.store.energy) amount = Math.floor(amount * term.store.energy / cost);
        if (amount < TERMINAL_MIN_SEND) return false;
        if (amount < have && have - amount < TERMINAL_MIN_SEND) {
            if (Game.time % kLogPace === 0) debug.log(this.name, term.room.name, "holds", have, res, "until it can send all of it", `(${why})`);
            return false;
        }
        const err = term.send(res, amount, to, this.name);
        if (err !== OK) {
            debug.log(this.name, "send failed", err, amount, res, term.room.name, "->", to, `(${why})`);
            return false;
        }
        debug.log(this.name, "sent", amount, res, term.room.name, "->", to, `(${why})`);
        return true;
    }

    // Rule 1: thorium to the thorium room.
    sendThorium(term: StructureTerminal, terms: StructureTerminal[]): boolean {
        // RESOURCE_THORIUM is typed optional (reactor.ts): no such resource off the season shard.
        const thorium = RESOURCE_THORIUM;
        if (!thorium) return false;
        const to = this.thoriumRoom;
        if (term.room.name === to) return false;
        const have = term.store[thorium] || 0;
        if (have < TERMINAL_MIN_SEND) return false;
        const dest = _.find(terms, t => t.room.name === to);
        if (!dest) return false;
        return this.ship(term, thorium, have, dest, "thorium");
    }

    // Rule 2: a feeder room's minerals and compounds to its nearest RCL8
    // room, the first resource that ships, what it holds more of than that
    // room.
    feedLabRoom(term: StructureTerminal, labTerms: StructureTerminal[]): boolean {
        const hubs = labTerms.filter(t => t.id !== term.id);
        if (!hubs.length) return false;
        const hub = _.min(hubs, t => Game.map.getRoomLinearDistance(term.room.name, t.room.name));
        for (const res of Object.keys(term.store) as ResourceConstant[]) {
            if (res === RESOURCE_ENERGY || res === RESOURCE_THORIUM || term.store[res] < TERMINAL_MIN_SEND) continue;
            const gap = Balance.stock(term.room, res) - Balance.stock(hub.room, res);
            if (gap < TERMINAL_MIN_SEND) continue;
            if (this.ship(term, res, Math.min(term.store[res], gap), hub, "feeding " + hub.room.name)) return true;
        }
        return false;
    }

    // Rule 3: an RCL8 room tops up a peer under kBaseFloor of a base
    // mineral, when it is the peer holding the most of it and keeps the
    // floor itself.
    shareBase(term: StructureTerminal, labTerms: StructureTerminal[]): boolean {
        if (labTerms.length < 2) return false;
        for (const res of kBaseMinerals) {
            if ((term.store[res] || 0) < TERMINAL_MIN_SEND) continue;
            const donor = _.max(labTerms, t => Balance.stock(t.room, res));
            if (donor.id !== term.id) continue;
            const spare = Balance.stock(term.room, res) - kBaseFloor;
            if (spare < TERMINAL_MIN_SEND) continue;
            const peers = labTerms.filter(t => t.id !== term.id);
            const low = _.min(peers, t => Balance.stock(t.room, res));
            const short = kBaseFloor - Balance.stock(low.room, res);
            if (short < TERMINAL_MIN_SEND) continue;
            if (this.ship(term, res, Math.min(spare, short), low, "floor " + res)) return true;
        }
        return false;
    }

    // Rule 4: an RCL8 room levels a catalyzed boost down to the peer holding
    // the least, when it is the peer holding the most, has kBoostRatio times
    // the least holder's stock and kBoostGap more: a kBoostShare-th of the
    // difference goes (at least TERMINAL_MIN_SEND by the gap), so repeated
    // sends close in without the two rooms swapping the lead.
    shareBoosts(term: StructureTerminal, labTerms: StructureTerminal[]): boolean {
        if (labTerms.length < 2) return false;
        for (const res of kBoosts) {
            if ((term.store[res] || 0) < TERMINAL_MIN_SEND) continue;
            const donor = _.max(labTerms, t => Balance.stock(t.room, res));
            if (donor.id !== term.id) continue;
            const peers = labTerms.filter(t => t.id !== term.id);
            const low = _.min(peers, t => Balance.stock(t.room, res));
            const have = Balance.stock(term.room, res);
            const theirs = Balance.stock(low.room, res);
            const diff = have - theirs;
            if (have < kBoostRatio * theirs || diff < kBoostGap) continue;
            const share = Math.floor(diff / kBoostShare);
            if (this.ship(term, res, Math.min(share, term.store[res]), low, "levelling " + res)) return true;
        }
        return false;
    }

    // The energy leveller: the fullest terminal off cooldown that did not
    // send this tick (`sent`) sends half the gap to the emptiest listed one
    // (receiving needs no cooldown).
    levelEnergy(terms: StructureTerminal[], sent: Set<string>) {
        if (terms.length < 2) return;
        const senders = terms.filter(t => !t.cooldown && !sent.has(t.id));
        if (!senders.length) return;
        const high = _.max(senders, t => t.store.energy);
        const low = _.min(terms, t => t.store.energy);
        if (high.id === low.id) return;
        const gap = high.store.energy - low.store.energy;
        if (gap < kMinGap) return;

        const dest = low.room.name;
        const want = Math.min(Math.floor(gap / 2), low.store.getFreeCapacity(RESOURCE_ENERGY));
        const amount = this.affordable(high, want, dest);
        if (!amount) {
            debug.log(this.name, high.room.name, "cannot afford to send", want, "to", dest);
            return;
        }
        const err = high.send(RESOURCE_ENERGY, amount, dest, this.name);
        if (err !== OK) {
            debug.log(this.name, "send failed", err, amount, high.room.name, "->", dest);
        } else {
            debug.log(this.name, "sent", amount, high.room.name, "->", dest, "gap was", gap);
        }
    }

    run(): Priority {
        if (this.memory.minerals) {
            debug.log(this.name, "dropping the old mineral room", this.memory.minerals, "(rules in docs/balance-design.md)");
            delete this.memory.minerals;
        }
        const terms = this.terminals();
        const labTerms = terms.filter(Balance.isLabRoom);
        // A terminal that sent this tick shows no cooldown until next tick.
        const sent = new Set<string>();
        for (const term of terms) {
            if (term.cooldown > 0) continue;
            const went = this.sendThorium(term, terms) ||
                (Balance.isLabRoom(term)
                    ? this.shareBase(term, labTerms) || this.shareBoosts(term, labTerms)
                    : this.feedLabRoom(term, labTerms));
            if (went) sent.add(term.id);
        }
        this.levelEnergy(terms, sent);
        return "low";
    }

    // Console: base mineral stock (terminal + storage) per RCL8 room.
    stocks(): string {
        const rooms = this.rooms.map(n => Game.rooms[n]).filter(r => r && (r.controller?.level || 0) >= kLabRCL) as Room[];
        const head = "room  " + kBaseMinerals.map(r => _.padLeft(r, 7)).join("");
        const rows = rooms.map(r => r.name + " " + kBaseMinerals.map(m => _.padLeft(String(Balance.stock(r, m)), 7)).join(""));
        return [head, ...rows].join("\n");
    }

    // Console: catalyzed boost stock (terminal + storage) per RCL8 room.
    boosts(): string {
        const rooms = this.rooms.map(n => Game.rooms[n]).filter(r => r && (r.controller?.level || 0) >= kLabRCL) as Room[];
        const head = "room  " + kBoosts.map(r => _.padLeft(r, 7)).join("");
        const rows = rooms.map(r => r.name + " " + kBoosts.map(m => _.padLeft(String(Balance.stock(r, m)), 7)).join(""));
        return [head, ...rows].join("\n");
    }

    status(): string {
        const levels = this.rooms.map(name => {
            const term = Game.rooms[name]?.terminal;
            const rcl = term?.room.controller?.level ?? "?";
            return `${name}:${!term?.my ? "-" : term.isActive() ? term.store.energy : "inactive"}(${rcl})`;
        });
        return super.status() + " terminals " + (levels.join(",") || "none") + ` thorium:${this.thoriumRoom} floor:${kBaseFloor}`;
    }
}
