import { theTick } from "cache";
import { log } from "debug";
import { roomToCoord, roomFromCoord, Coord, roomKindXY, RoomIntel, Kind, roomKind } from "intel";

interface RadarTickCache {
    observers?: StructureObserver[];
    targets?: string[];
}

class Radar {
    id = "radar";
    tick: RadarTickCache;
    iter = roomScanIter();
    register(ob: StructureObserver) {
        if (this.tick.observers) {
            this.tick.observers.push(ob);
        } else {
            this.tick.observers = [ob];
        }
    }

    run() {
        const begin = Game.cpu.getUsed();
        // TODO prioritize targets based on number of obs in range.
        const targets = this.tick.targets || [];
        this.observeNow(...targets);
        _.forEach(this.tick.observers!, ob => {
            const name = this.scan(ob.room.name);
            if (name) {
                // ob.room.log("scanning", name, Game.map.getRoomLinearDistance(ob.room.name, name));
                ob.room.errlog(ob.observeRoom(name), "Failed background scan");
            } else {
                // ob.room.log("observer resting");
            }
        });
        const end = Game.cpu.getUsed();
        //console.log("radar run", end - begin);
    }

    observeNow(...targets: string[]) {
        for (const target of targets) {
            const ob = _.find(this.tick.observers!,
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

    // An observer will observe roomName
    observe(roomName: string) {
        if (this.tick.targets) {
            this.tick.targets.push(roomName);
        } else {
            this.tick.targets = [roomName];
        }
        return roomName;
    }

    observing(roomName: string) {
        return _.contains(this.tick.targets!, roomName);
    }

    // Scan room around this room. Prefering Hwy rooms
    // Returns the room chosen to be observed.
    scan(originRoom: string): string | null {
        const [x, y] = roomToCoord(originRoom);
        for (let i = 0; i < 10; i++) {
            const [dx, dy] = this.nextCoord();
            const nx = x + dx;
            const ny = y + dy;
            const obRoom = roomFromCoord(nx, ny);

            if (Game.rooms[obRoom] || this.observing(obRoom)) continue;

            const intel = RoomIntel.get(obRoom);
            if (!intel) {
                return this.observe(obRoom);
            }
            if (intel.staleness > 100) {
                return this.observe(obRoom);
            }
            const kind = roomKind(obRoom);
            if (kind === Kind.Hwy) {
                if (intel.staleness > 10) {
                    return this.observe(obRoom);
                }
                return null;

            }
            // log('too soon', intel.name, kind, intel.staleness);
        }
        return null;
    }

    nextCoord(): Coord {
        const ret = this.iter.next();
        if (ret.done) {
            log("failed to iter", JSON.stringify(ret));
            return [0, 0];
        }
        return ret.value;
    }

}
theTick.inject(Radar);

export const theRadar = new Radar();

function* roomScanIter() {
    let pool3 = [] as Coord[]
    let pool6 = [] as Coord[]
    let pool10 = [] as Coord[]
    while (true) {
        // if (!pool6.length) {
        //     log("rebuild pool 6");
        //     pool6 = getDelta(6);
        // }
        // yield pool6.pop()!;
        if (!pool10.length) {
            log("rebuild pool 10");
            pool10 = getDelta(10);
        }
        yield pool10.pop()!;
    }
}

function getDelta(range: number): Coord[] {
    const ret = [] as Coord[];
    for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
            ret.push([dx, dy]);
        }
    }
    return _.shuffle(ret);
}