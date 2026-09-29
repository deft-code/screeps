import { fromXY, defaultRewalker, SKInfo, Rewalker, whoami } from "Rewalker";

export function bestDeposit(room: Room): Deposit | null {
    const deposits = room.find(FIND_DEPOSITS);
    deposits.sort((a, b) => {
        const acd = a.lastCooldown || 0;
        const bcd = b.lastCooldown || 0;
        return acd - bcd;
    });
    return _.first(deposits);
}


interface RoomIntelMem {
    last: number
    enabled?: true
    portal?: [string, number]
    owner?: [number, number]
    core?: [number, number]
    power?: [number, number, number]
    deposit?: [number, number, number]
    // Packed xy (RoomPosition.xy) of the sources and the controller. Fixed
    // for the room's life, so written once on first sight.
    src?: number[]
    ctrl?: number
    // The room's ordinary mineral, fixed like the sources.
    min?: number
    // Season 11: the thorium mineral (RESOURCE_THORIUM, a second Mineral in
    // FIND_MINERALS) as [xy, amount], rewritten on every visit. It vanishes
    // from the room once mined out, so a visit without one deletes the key:
    // no key after first sight means none left (or never any).
    thor?: [number, number]
    // Keeper rooms: where each Source Keeper stands (Rewalker's SKInfo
    // memory; 0 until seen), a copy of what Rewalker.skInfo learns while
    // the room is visible.
    sk?: number[]
}

declare global {
    interface RoomMemory {
        intel: RoomIntelMem
    }
    interface Memory {
        intel: {
            users: string[]
            recs: string[]
            recExpire: number
        }
    }
}

if (!Memory.intel) {
    Memory.intel = {
        users: [],
        recs: [],
        recExpire: 2 * Game.time,
    };
}

export class RoomIntel {
    static get(roomName: string): RoomIntel | null {
        if (!Memory.rooms[roomName]) return null;
        if (!Memory.rooms[roomName].intel) return null;
        return new RoomIntel(roomName);
    }

    constructor(public readonly name: string) { }
    get mem(): RoomIntelMem { return Memory.rooms[this.name].intel; }
    get owner(): string | null {
        const ownerIntel = this.mem.owner;
        if (!ownerIntel) return null;
        return Memory.intel.users[ownerIntel[0]];
    }
    get rcl(): number | null {
        const info = this.mem;
        if (!info.owner) return null;
        return info.owner[1];
    }
    get powerEnabled() {
        return !!this.mem.enabled;
    }
    get staleness() {
        return Game.time - this.mem.last;
    }
    get coreLvl() {
        if (!this.mem.core) return 0;
        if (this.mem.core[1] < Game.time) {
            delete this.mem.core;
            return 0;
        }
        return this.mem.core[0]
    }
    get powerTTL(): number {
        const pMem = this.mem.power;
        if (!pMem) return 0;
        const ttl = pMem[2] - Game.time;
        if (ttl < 0) {
            delete this.mem.power;
            return 0;
        }
        return ttl;
    }

    get depositPos() {
        const mem = this.mem.deposit;
        if (!mem) return null;
        return fromXY(mem[0], this.name);
    }
    get depositCooldown(): number {
        const mem = this.mem.deposit;
        if (!mem) return 0;
        return mem[1];
    }

    get depositTTL(): number {
        const mem = this.mem.deposit;
        if (!mem) return 0;
        const ttl = mem[2] - Game.time;
        if (ttl < 0) {
            delete this.mem.deposit;
            return 0;
        }
        return ttl;
    }

    // Sources seen in the room, vision or not; [] before first sight.
    get srcXYs(): number[] {
        return this.mem.src || [];
    }
    get srcPos(): RoomPosition[] {
        return this.srcXYs.map(xy => fromXY(xy, this.name));
    }
    // The controller, or null for a room without one (or not yet seen).
    get ctrlXY(): number | null {
        return this.mem.ctrl ?? null;
    }
    get ctrlPos(): RoomPosition | null {
        const xy = this.ctrlXY;
        return xy === null ? null : fromXY(xy, this.name);
    }
    // The ordinary mineral, or null before first sight.
    get minXY(): number | null {
        return this.mem.min ?? null;
    }
    get minPos(): RoomPosition | null {
        const xy = this.minXY;
        return xy === null ? null : fromXY(xy, this.name);
    }
    // The thorium mineral as of the last visit, or null when the room had
    // none (mined out, or never any).
    get thorXY(): number | null {
        return this.mem.thor ? this.mem.thor[0] : null;
    }
    get thorPos(): RoomPosition | null {
        const xy = this.thorXY;
        return xy === null ? null : fromXY(xy, this.name);
    }
    get thorAmount(): number {
        return this.mem.thor ? this.mem.thor[1] : 0;
    }
    // The keepers known to stand in the room; all zeros outside keeper rooms.
    get sk(): SKInfo {
        return new SKInfo(this.mem.sk || []);
    }
}

// Rewalker imports nothing: it asks here for a blind room's keepers.
defaultRewalker().blindSKInfo = roomName => new SKInfo(Memory.rooms[roomName]?.intel?.sk || []);

// ...and for the route cost of a room out of sight, from what intel last
// saw of it: a stronghold (deployed invader core) or another player's base
// cost as with vision, a foreign reservation likewise, our own rooms are
// cheap; null (no intel, or nothing notable) leaves it to the guess.
export function blindRoomCost(roomName: string): number | null {
    const intel = RoomIntel.get(roomName);
    if (!intel) return null;
    const cost = Rewalker.routeCost;
    if (intel.coreLvl > 0) return cost.invaderCore;
    const owner = intel.owner;
    if (!owner) return null;
    const rcl = intel.rcl || 0;
    if (owner === whoami()) return rcl >= 3 ? cost.myClaimed : cost.myReserved;
    return rcl > 0 ? cost.hostileClaimed : cost.hostileReserved;
}
defaultRewalker().blindRoomCost = blindRoomCost;

export function updateIntel(room: Room) {
    const intel = RoomIntel.get(room.name);
    if (!intel) {
        if (!Memory.rooms[room.name]) {
            Memory.rooms[room.name] = {} as RoomMemory;
        }
        if (!Memory.rooms[room.name].intel) {
            Memory.rooms[room.name].intel = { last: 0 };
        }
    }
    updateIntelMem(Memory.rooms[room.name].intel, room);
}

export function userIdx(username: string): number {
    const idx = _.findIndex(Memory.intel.users, u => u === username);
    if (idx >= 0) return idx;
    Memory.intel.users.push(username);
    Memory.intel.users.sort();
    return _.findIndex(Memory.intel.users, username);
}

function updateIntelMem(mem: RoomIntelMem, room: Room) {
    mem.last = Game.time;

    if (!mem.src) mem.src = room.find(FIND_SOURCES).map(s => s.pos.xy);

    const minerals = room.find(FIND_MINERALS);
    const thor = _.find(minerals, m => m.mineralType === RESOURCE_THORIUM);
    if (mem.min === undefined) {
        const min = _.find(minerals, m => m.mineralType !== RESOURCE_THORIUM);
        if (min) mem.min = min.pos.xy;
    }
    if (thor) mem.thor = [thor.pos.xy, thor.mineralAmount];
    else delete mem.thor;

    const controller = room.controller;
    if (controller) {
        if (mem.ctrl === undefined) mem.ctrl = controller.pos.xy;
        // Owned, else reserved (rcl 0), else nobody's: a lapsed reservation
        // or a lost room drops the key, so owner/rcl never go stale.
        const owner = controller.owner;
        const res = controller.reservation;
        if (owner) {
            mem.owner = [userIdx(owner.username), controller.level];
        } else if (res) {
            mem.owner = [userIdx(res.username), 0];
        } else {
            delete mem.owner;
        }
    }

    const kind = roomKind(room.name)
    // Strongholds live in SK rooms; Season 11 sector cores (the Portal kind,
    // x5y5) can hold one too, guarding the reactor.
    if (kind === Kind.SourceKeeper) mem.sk = defaultRewalker().skInfo(room.name).memory.slice();
    if (kind === Kind.SourceKeeper || kind === Kind.Portal) {
        const core = _.first(room.findStructs(STRUCTURE_INVADER_CORE));
        if (core) {
            mem.core = [core.level, Game.time + core.effectTTL(EFFECT_COLLAPSE_TIMER)];
        } else {
            delete mem.core;
        }
    }

    if (kind === Kind.Hwy) {
        const deposit = bestDeposit(room);
        if (deposit) {
            const expire = deposit.ticksToDecay + Game.time;
            mem.deposit = [deposit.pos.xy, deposit.lastCooldown || 1, expire];
            addHwyRec(room.name, expire);
        } else {
            delete mem.deposit;
        }

        const bank = _.first(room.findStructs(STRUCTURE_POWER_BANK));
        if (bank) {
            const expire = bank.ticksToDecay + Game.time;
            mem.power = [bank.pos.xy, bank.power, expire];
            addHwyRec(room.name, expire);
        } else {
            delete mem.power;
        }
    }
}

function addHwyRec(roomName: string, expire: number) {
    if (!(expire >= Memory.intel.recExpire)) {
        Memory.intel.recExpire = expire;
    }
    const len = _.size(Memory.intel.recs);
    if (len === 0) {
        Memory.intel.recs = [roomName];
    } else {
        const idx = _.sortedIndex(Memory.intel.recs, roomName);
        if (idx >= len || Memory.intel.recs[idx] !== roomName) {
            Memory.intel.recs.push(roomName);
            Memory.intel.recs.sort();
        }
    }
}

export function cleanIndex() {
    let minTTL = 1000000;
    const nextRecs = [];
    for (const room of Memory.intel.recs) {
        let keep = false;
        const intel = RoomIntel.get(room);
        if (intel) {
            const ttl = intel.powerTTL || intel.depositTTL;
            if (ttl) {
                keep = true;
                minTTL = Math.min(ttl, minTTL);
            }
        }
        if (keep) {
            nextRecs.push(room);
        }
    }
    nextRecs.sort();
    Memory.intel.recs = _.uniq(nextRecs, true);
    Memory.intel.recExpire = minTTL + Game.time;
}

export const enum Kind {
    Hwy = "hwy",
    Portal = "portal",
    SourceKeeper = "sk",
    Regular = "regular",
}

export function roomKind(roomName: string): Kind {
    return roomKindXY(...roomToCoord(roomName));
}

export function roomKindXY(x: number, y: number): Kind {
    if (x < 0) x = -x - 1;
    if (y < 0) y = -y - 1;

    const ox = x % 10;
    const oy = y % 10;

    if (ox === 0 || oy === 0) return Kind.Hwy;
    if (ox === 5 && oy === 5) return Kind.Portal;
    if (ox >= 4 && ox <= 6 && oy >= 4 && oy <= 6) return Kind.SourceKeeper;
    return Kind.Regular;
}

export type Coord = [number, number];

export function roomToCoord(name: string): Coord {
    let xx = parseInt(name.substr(1), 10);
    let verticalPos = 2;
    if (xx >= 100) {
        verticalPos = 4;
    } else if (xx >= 10) {
        verticalPos = 3;
    }
    let yy = parseInt(name.substr(verticalPos + 1), 10);
    let horizontalDir = name.charAt(0);
    let verticalDir = name.charAt(verticalPos);
    if (horizontalDir === 'W' || horizontalDir === 'w') {
        xx = -xx - 1;
    }
    if (verticalDir === 'N' || verticalDir === 'n') {
        yy = -yy - 1;
    }
    return [xx, yy];
}

export function roomFromCoord(x: number, y: number): string {
    if (x < 0) {
        if (y < 0) {
            return `W${-x - 1}N${-y - 1}`;
        } else {
            return `W${-x - 1}S${y}`;
        }
    } else {
        if (y < 0) {
            return `E${x}N${-y - 1}`;
        } else {
            return `E${x}S${y}`;
        }
    }
}
