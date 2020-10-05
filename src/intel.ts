import { fromXY } from "Rewalker";

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
}

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

    const controller = room.controller;
    if (controller) {
        const owner = controller.owner;
        if (owner) {
            mem.owner = [userIdx(owner.username), controller.level];
        } else {
            const res = controller.reservation;
            if (res) {
                mem.owner = [userIdx(res.username), 0];
            }
        }
    }

    const kind = roomKind(room.name)
    if (kind === Kind.SourceKeeper) {
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
