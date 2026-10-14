import { errlog, log } from "debug";
import { roomToCoord, roomFromCoord, Coord, RoomIntel, Kind, roomKind } from "intel";
import { TObserver } from "tstruct.observer";

// Intel older than this (ticks) is worth another look; highway rooms sooner.
const kStale = 100;
const kStaleHwy = 10;

// How far around itself an idle observer looks for stale rooms, nearest
// first. A scan radius, not a limit: every observe goes through observeMax
// (tstruct.observer.ts), which reaches any room on the map.
const kScanRange = OBSERVER_RANGE;
const kDeltas: Coord[] = getDelta(kScanRange);

// Score offsets for the three request sets: priority rooms sort as if 1000
// ticks staler, background rooms as if 1000 fresher.
const kPriorityBoost = 1000;
// Age of a room never seen, for sorting.
const kNeverSeen = 1e9;
// A background request is ignored while the room was seen more recently
// than this (ticks).
const kBackgroundMinStale = 50;

interface Target {
    room: string
    // Ticks since last seen, offset by the set it came from.
    age: number
}

class Radar {
    // The observers the radar may use, by id (add / remove; strat.ts adds
    // its room's observer every tick at RCL8, which is idempotent, and run()
    // drops any not in sight this tick). Heap: the wrappers outlive the tick.
    observers = new Map<Id<StructureObserver>, TObserver>();
    // Rooms asked for and not yet handed to an observer, by urgency
    // (observeNow / observe / observeBackground). On the heap rather than
    // in the tick cache: a request made after run() this tick (deposit.ts
    // runs after it) is served next tick, not dropped.
    priority = new Set<string>();
    normal = new Set<string>();
    background = new Set<string>();

    add(ob: TObserver): TObserver {
        this.observers.set(ob.id, ob);
        return ob;
    }

    remove(ob: TObserver): boolean {
        return this.observers.delete(ob.id);
    }

    // Ask for rooms ahead of everything else.
    observeNow(...roomNames: string[]) {
        for (const name of roomNames) this.priority.add(name);
    }

    // Ask for rooms.
    observe(...roomNames: string[]) {
        for (const name of roomNames) this.normal.add(name);
    }

    // Ask for rooms when nothing more pressing wants the observers.
    observeBackground(...roomNames: string[]) {
        for (const name of roomNames) this.background.add(name);
    }

    run() {
        const targets = this.targets();
        this.priority.clear();
        this.normal.clear();
        this.background.clear();
        // Rooms given an observer this tick, so no scan picks one again.
        const observed = new Set<string>();
        // The observers in sight this tick; one that is not (gone, or its
        // room out of view) is dropped, to be added again when seen. Each
        // target takes one out of the list, the rest look for stale rooms
        // of their own.
        const free: TObserver[] = [];
        for (const ob of this.observers.values()) {
            if (ob.s) free.push(ob);
            else this.remove(ob);
        }
        // Any observer serves any room (observeMax), so the first free one
        // takes each target. Targets left over once the observers run out
        // are dropped (the sets are cleared above), and said so.
        const unserved: string[] = [];
        for (const t of targets) {
            if (!this.wanted(t.room)) continue;
            const ob = free.shift();
            if (!ob) {
                unserved.push(t.room);
                continue;
            }
            errlog(ob.observeMax(t.room), "Unexpected observer error for target", ob, t.room);
            observed.add(t.room);
        }
        if (unserved.length) log("radar: no observer free for", unserved.join(" "));
        for (const ob of free) {
            const name = this.scan(ob.roomName, observed);
            if (!name) continue;
            errlog(ob.observeMax(name), "Failed background scan", ob, name);
            observed.add(name);
        }
    }

    // Every requested room with its age (ticks since last seen, kNeverSeen
    // for one never seen) offset by its set, stalest first. A room in more
    // than one set counts once, at its most urgent. A background room seen
    // within kBackgroundMinStale ticks is left out.
    targets(): Target[] {
        const byRoom = new Map<string, number>();
        const put = (names: Set<string>, offset: number, minStale = 0) => {
            for (const room of names) {
                const stale = RoomIntel.get(room)?.staleness ?? kNeverSeen;
                if (stale < minStale) continue;
                const age = stale + offset;
                const have = byRoom.get(room);
                if (have === undefined || age > have) byRoom.set(room, age);
            }
        };
        put(this.priority, kPriorityBoost);
        put(this.normal, 0);
        put(this.background, -kPriorityBoost, kBackgroundMinStale);
        const targets = [...byRoom].map(([room, age]) => ({ room, age }));
        return _.sortBy(targets, t => -t.age);
    }

    // Whether observing `room` would gain anything this tick: never for a
    // room past the map edge or closed (observeRoom would fail); yes while
    // it is out of sight; with sight, no for a claimed room or one our
    // creeps or power creeps are in (they keep the vision), yes for one
    // with no creeps at all (the vision is the observer's own from last
    // tick, so it is re-observed to keep it).
    wanted(room: string): boolean {
        const [x, y] = roomToCoord(room);
        if (!roomOpen(x, y, room)) return false;
        const r = Game.rooms[room];
        if (!r) return true;
        if (r.controller?.owner) return false;
        if (r.find(FIND_MY_CREEPS).length || r.find(FIND_MY_POWER_CREEPS).length) return false;
        // Re-observed: visible only through an observer, and nobody of ours
        // is there to keep it in sight.
        return true;
    }

    // The room in range of originRoom most in need of a look: one never
    // seen, else the one furthest past its threshold (kStaleHwy on highways,
    // kStale elsewhere); null when every room in range is fresh. Rooms in
    // sight, in `avoid` (observed this tick), closed, or past the map edge
    // are skipped.
    scan(originRoom: string, avoid: Set<string> = new Set()): string | null {
        const [x, y] = roomToCoord(originRoom);
        let best: string | null = null;
        let bestOver = 1;
        for (const [dx, dy] of kDeltas) {
            const nx = x + dx;
            const ny = y + dy;
            const obRoom = roomFromCoord(nx, ny);
            if (Game.rooms[obRoom] || avoid.has(obRoom) || !roomOpen(nx, ny, obRoom)) continue;

            const intel = RoomIntel.get(obRoom);
            if (!intel) return obRoom;
            const limit = roomKind(obRoom) === Kind.Hwy ? kStaleHwy : kStale;
            const over = intel.staleness / limit;
            if (over > bestOver) {
                best = obRoom;
                bestOver = over;
            }
        }
        return best;
    }
}

export const theRadar = new Radar();

// Whether the room at (x, y) exists and is open: observeRoom of a name past
// the map edge, or of a closed room, fails with ERR_INVALID_ARGS. The bounds
// test is written to fail NaN too, so a malformed name (roomToCoord gives
// NaN) never reaches getRoomStatus, which throws on it.
function roomOpen(x: number, y: number, roomName: string): boolean {
    const half = Game.map.getWorldSize() / 2;
    if (!(x >= -half && x < half && y >= -half && y < half)) return false;
    return Game.map.getRoomStatus(roomName).status !== "closed";
}

// Every (dx, dy) within `range`, ordered by distance so ties in scan() go
// to the nearer room.
function getDelta(range: number): Coord[] {
    const ret = [] as Coord[];
    for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
            ret.push([dx, dy]);
        }
    }
    return _.sortBy(ret, ([dx, dy]) => Math.max(Math.abs(dx), Math.abs(dy)));
}
