import { theTick } from "cache";
import { log } from "debug";
import { roomToCoord, roomFromCoord, Coord, RoomIntel, Kind, roomKind } from "intel";

interface RadarTickCache {
    observers?: StructureObserver[];
    targets?: string[];
}

// Intel older than this (ticks) is worth another look; highway rooms sooner.
const kStale = 100;
const kStaleHwy = 10;

// Every room offset an observer can reach, nearest first.
const kDeltas: Coord[] = getDelta(OBSERVER_RANGE);

class Radar {
    id = "radar";
    tick: RadarTickCache;
    // Rooms asked for by observe() and not yet handed to an observer. On the
    // heap rather than in the tick cache: a request made after run() this
    // tick (deposit.ts runs after it) is served next tick, not dropped.
    pending: string[] = [];

    register(ob: StructureObserver) {
        if (this.tick.observers) {
            this.tick.observers.push(ob);
        } else {
            this.tick.observers = [ob];
        }
    }

    run() {
        // TODO prioritize targets based on number of obs in range.
        const targets = this.tick.targets = _.uniq([...(this.tick.targets || []), ...this.pending]);
        this.pending = [];
        this.observeNow(...targets);
        _.forEach(this.tick.observers || [], ob => {
            const name = this.scan(ob.room.name);
            if (name) ob.room.errlog(ob.observeRoom(name), "Failed background scan", name);
        });
    }

    observeNow(...targets: string[]) {
        for (const target of targets) {
            const ob = _.find(this.tick.observers || [],
                ob =>
                    ob.effectTTL(PWR_OPERATE_OBSERVER) > 0 ||
                    Game.map.getRoomLinearDistance(ob.pos.roomName, target) <= OBSERVER_RANGE);
            if (!ob) {
                log("Unable to target", target);
                continue;
            }
            // If this is common implment prioritization
            ob.room.errlog(ob.observeRoom(target), "Unexpected observer error for target", target);
            _.remove(this.tick.observers!, o => o.id === ob.id);
        }
    }

    // Ask for roomName to be observed: this tick if run() has not happened
    // yet, else next tick.
    observe(roomName: string) {
        if (!this.observing(roomName)) this.pending.push(roomName);
        return roomName;
    }

    // Already chosen this tick, or waiting for the next run().
    observing(roomName: string) {
        return _.contains(this.tick.targets || [], roomName) || _.contains(this.pending, roomName);
    }

    // Record a room chosen by a background scan this tick, so no other
    // observer picks it too.
    mark(roomName: string): string {
        if (this.tick.targets) {
            this.tick.targets.push(roomName);
        } else {
            this.tick.targets = [roomName];
        }
        return roomName;
    }

    // The room in range of originRoom most in need of a look: one never
    // seen, else the one furthest past its threshold (kStaleHwy on highways,
    // kStale elsewhere); null when every room in range is fresh. Rooms in
    // sight, already chosen, closed, or past the map edge are skipped.
    scan(originRoom: string): string | null {
        const [x, y] = roomToCoord(originRoom);
        let best: string | null = null;
        let bestOver = 1;
        for (const [dx, dy] of kDeltas) {
            const nx = x + dx;
            const ny = y + dy;
            const obRoom = roomFromCoord(nx, ny);
            if (Game.rooms[obRoom] || this.observing(obRoom) || !roomOpen(nx, ny, obRoom)) continue;

            const intel = RoomIntel.get(obRoom);
            if (!intel) return this.mark(obRoom);
            const limit = roomKind(obRoom) === Kind.Hwy ? kStaleHwy : kStale;
            const over = intel.staleness / limit;
            if (over > bestOver) {
                best = obRoom;
                bestOver = over;
            }
        }
        return best ? this.mark(best) : null;
    }
}
theTick.inject(Radar);

export const theRadar = new Radar();

// Whether the room at (x, y) exists and is open: observeRoom of a name past
// the map edge, or of a closed room, fails with ERR_INVALID_ARGS.
function roomOpen(x: number, y: number, roomName: string): boolean {
    const half = Game.map.getWorldSize() / 2;
    if (x < -half || x >= half || y < -half || y >= half) return false;
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
