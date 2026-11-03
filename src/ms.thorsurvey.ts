import { register, Priority, Service } from "process";
import { theRadar } from "radar";
import { RoomIntel } from "intel";
import * as debug from "debug";

// TEMPORARY (1 Nov 2026): a survey of where thorium sits, to pick a room
// to raid for it after the season. Not part of intel; delete it with its
// Memory.thorsurvey once the question is answered.
//
//   scheduleService('ThorSurvey W15S5 NW')   // args[1]=any room of the sector, args[2]=NW|NE|SW|SE|all (all when left out)
//   getService('ThorSurvey W15S5 NW').status()   // every surveyed room, most thorium first
//   getService('ThorSurvey W15S5 NW').table()    // the same as one line per room
//
// Every tick it asks the radar (theRadar.observe, stalest first) for the
// quadrant's non-highway rooms and, for each one in sight, writes
// Memory.thorsurvey[room]: the tick, the thorium in every structure store
// (by structure type), in piles, tombstones, ruins and creeps, the total,
// the controller's owner or reserver and the thorium mineral's amount.
// Rooms are visited again as they go stale, so the record is as fresh as
// the observers allow. Nothing else reads the memory.

declare global {
    interface Memory {
        thorsurvey?: Record<string, ThorRecord>
    }
}

interface ThorRecord {
    // Tick of the look.
    t: number
    // Thorium by holder: structure type, "pile", "tomb", "ruin" or "creep".
    by: Record<string, number>
    total: number
    owner: string | null
    rcl: number
    // The thorium mineral's amount, 0 without one.
    mineral: number
}

// The two letters and two numbers of a room name.
function parseRoom(name: string): [string, number, string, number] {
    const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
    if (!m) throw new Error(`bad room name ${name}`);
    return [m[1], parseInt(m[2], 10), m[3], parseInt(m[4], 10)];
}

// The non-highway rooms of the sector holding `room`, or of one quadrant
// of it: N/S and W/E halves split at the sector's x5y5 core, the core row
// and column going to both halves.
export function sectorRooms(room: string, quadrant = "all"): string[] {
    const [h, hx, v, vy] = parseRoom(room);
    const bx = Math.floor(hx / 10) * 10;
    const by = Math.floor(vy / 10) * 10;
    const q = quadrant.toUpperCase();
    // Toward the pole named by the letter means a larger number, so "north"
    // is larger in N rooms and smaller in S rooms; likewise west and W.
    const wants = (n: number, letter: string, towards: string, away: string): boolean => {
        if (q === "ALL") return true;
        const o = n % 10;
        if (o === 5) return true;
        const high = o > 5;
        if (q.includes(towards)) return letter === towards ? high : !high;
        if (q.includes(away)) return letter === towards ? !high : high;
        return true;
    };
    const rooms: string[] = [];
    for (let x = bx + 1; x <= bx + 9; x++) {
        if (!wants(x, h, "W", "E")) continue;
        for (let y = by + 1; y <= by + 9; y++) {
            if (!wants(y, v, "N", "S")) continue;
            rooms.push(`${h}${x}${v}${y}`);
        }
    }
    return rooms;
}

@register
export class ThorSurvey extends Service {
    get rooms(): string[] {
        return sectorRooms(this.args[1], this.args[2] || "all");
    }

    get mem(): Record<string, ThorRecord> {
        return Memory.thorsurvey = Memory.thorsurvey || {};
    }

    run(): Priority {
        const rooms = this.rooms;
        theRadar.observe(...rooms);
        for (const name of rooms) {
            const room = Game.rooms[name];
            if (room) this.record(room);
        }
        return "low";
    }

    record(room: Room) {
        // RESOURCE_THORIUM is a global typed optional (reactor.ts): undefined off the season shard.
        const T = RESOURCE_THORIUM;
        if (!T) return;
        const by: Record<string, number> = {};
        const add = (k: string, n: number) => {
            if (n > 0) by[k] = (by[k] || 0) + n;
        };
        for (const s of room.find(FIND_STRUCTURES)) {
            const store = (s as AnyStoreStructure).store;
            if (store) add(s.structureType, (store as GenericStore)[T] || 0);
        }
        for (const d of room.find(FIND_DROPPED_RESOURCES)) {
            if (d.resourceType === T) add("pile", d.amount);
        }
        for (const t of room.find(FIND_TOMBSTONES)) add("tomb", t.store.getUsedCapacity(T) || 0);
        for (const r of room.find(FIND_RUINS)) add("ruin", r.store.getUsedCapacity(T) || 0);
        for (const c of room.find(FIND_CREEPS)) add("creep", c.store.getUsedCapacity(T) || 0);
        const mineral = _.find(room.find(FIND_MINERALS), m => m.mineralType === T);
        const ctrl = room.controller;
        const rec: ThorRecord = {
            t: Game.time,
            by,
            total: _.sum(Object.keys(by).map(k => by[k])),
            owner: ctrl?.owner?.username || ctrl?.reservation?.username || null,
            rcl: ctrl?.level || 0,
            mineral: mineral ? mineral.mineralAmount : 0,
        };
        const old = this.mem[room.name];
        if (!old || old.total !== rec.total) debug.log(this.name, room.name, "thorium", rec.total, JSON.stringify(by));
        this.mem[room.name] = rec;
    }

    // One line per surveyed room, most thorium first, the unseen last.
    lines(): string[] {
        const mem = this.mem;
        const rooms = this.rooms;
        const seen = _.sortBy(rooms.filter(r => mem[r]), r => -mem[r].total);
        const out = seen.map(r => {
            const m = mem[r];
            const by = _.map(m.by, (n, k) => `${k}:${n}`).join(" ");
            const who = m.owner ? ` ${m.owner}${m.rcl ? "@" + m.rcl : " (reserved)"}` : "";
            return `${r} T:${m.total}${by ? " [" + by + "]" : ""} mineral:${m.mineral}${who} age:${Game.time - m.t}`;
        });
        const unseen = rooms.filter(r => !mem[r]);
        if (unseen.length) out.push(`unseen: ${unseen.map(r => `${r}(${RoomIntel.get(r)?.staleness ?? "never"})`).join(" ")}`);
        return out;
    }

    table(): string {
        return this.lines().join("\n");
    }

    status(): string {
        const rooms = this.rooms;
        const seen = rooms.filter(r => this.mem[r]).length;
        const total = _.sum(rooms, r => this.mem[r]?.total || 0);
        return super.status() + ` rooms:${seen}/${rooms.length} thorium:${total} | ` + this.lines().join(" | ");
    }
}
