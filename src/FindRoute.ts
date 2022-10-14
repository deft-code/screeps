import PriorityQueue from "PriorityQueue";

type CENTER = 9;
const CENTER: CENTER = 9;

type Dirs = TOP | RIGHT | BOTTOM | LEFT | CENTER;


export type LatLon = {
    lat: number
    lon: number
}

// This is intended to behave identically to roomNameToXY from engine/src/utils.js
export function roomNameToLatLon(name: string): LatLon {
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
    return {lat: xx, lon: yy};
}

function latLonToRoomName(ll: LatLon): string {
    return "todo";
}

type Options = {
    portals?: Map<string, string>
    latLonPortals?: Map<LatLon, LatLon>
}



function defaultExits(roomName: string): Dirs[] {
    const exits = Game.map.describeExits(roomName);
    return [TOP, RIGHT, BOTTOM, LEFT].filter(d => !!exits[d]);
}

function adjustLatLon(ll: LatLon, dir: Dirs): LatLon {
    switch(dir) {
        case TOP: return {lat: ll.lat-0.5, lon: ll.lon};
        case RIGHT: return {lat: ll.lat, lon: ll.lon+0.5};
        case BOTTOM: return {lat: ll.lat+0.5, lon: ll.lon};
        case LEFT: return {lat: ll.lat, lon: ll.lon-0.5};
    }
    return ll;
}

export function FindRoute(fromRoom:string, destRoom:string) {
    const fromLL = roomNameToLatLon(fromRoom);
    const destLL = roomNameToLatLon(destRoom);
    const exits = defaultExits(destRoom);
    const dests = exits.map(d => adjustLatLon(destLL,d));
    const ret = findRoute([fromLL], dests);
}

function latLonKey(ll: LatLon): string {
    return `${ll.lat},${ll.lon}`;
}

function equalLatLon(a: LatLon, b: LatLon): boolean {
    return a.lat === b.lat && a.lon === b.lon;
}

class AStar {
    pq: PriorityQueue
    dests: LatLon[]
    gScore: Map<string, number>
    parent: Map<string, LatLon>
    portals: Map<string, LatLon[]>

    constructor(froms: LatLon[], dests: LatLon[]) {
        this.dests = dests;
        this.pq = new PriorityQueue();
    }

    h(from: LatLon, dest: LatLon): number {
        return Math.max(
            Math.abs(dest.lat - from.lat),
            Math.abs(dest.lon - from.lon));
    }

    getExits(ll: LatLon): Dirs[] {
        const roomName = latLonToRoomName(ll);
        return defaultExits(roomName);
    }

    getRoomNeighbors(room: LatLon): LatLon[] {
        const exits = this.getExits(room)
        const ret =  exits.map(e => adjustLatLon(room, e));
        const roomKey = latLonKey(room);
        const portals = this.portals.get(roomKey);
        if(portals) {
            ret.push(...portals)
        }
        return ret;
    }

    getNeighbors(next: LatLon): LatLon[] {
        const ret = [];
        const flat: LatLon = {
            lat: Math.floor(next.lat),
            lon: Math.floor(next.lon)
        };

        let neighbors = this.getRoomNeighbors(flat)
        if(flat.lat < next.lat ) {
            neighbors.push(...this.getRoomNeighbors({lat: flat.lat+1, lon: flat.lon}));
        } else if (flat.lon < next.lon) {
            neighbors.push(...this.getRoomNeighbors({lat: flat.lat, lon: flat.lon+1}));
        }
        return neighbors.filter(n => !equalLatLon(n, next));
    }

    step(): LatLon | null {
        const next = this.pq.peek() as LatLon | null;
        if(next === null) return null;
        const nextKey = latLonKey(next);

        if(_.any(this.dests, d => equalLatLon(d, next))) {
            return next;
        }

        this.pq.pop();

        const neighbors = this.getNeighbors(next); 
        for(const neighbor of neighbors) {
            const neighborKey = latLonKey(neighbor);
            let dist = Math.max(
                Math.abs(neighbor.lat - next.lat),
                Math.abs(neighbor.lon - next.lon));

            // Dists through a portal show up as too large. Force them to a half width.
            if(dist > 1) {
                dist = 0.5
            }

            const score = dist + this.gScore.get(nextKey)!;
            if(this.gScore.has(neighborKey)) {
                const oldScore = this.gScore.get(neighborKey)!;
                if(score > oldScore) {
                    this.gScore.set(neighborKey, score);
                    this.parent.set(neighborKey, next);
                    const h = _.min(this.dests.map(d => this.h(neighbor, d)));
                    this.pq.updateKey(neighborKey, score + h);
                }
            } else {
                this.gScore.set(neighborKey, score);
                const h = _.min(this.dests.map(d => this.h(neighbor, d)));
                this.parent.set(neighborKey, next);
            }
        }
        return null;
    }








}

function findRoute(froms: LatLon[], dests: LatLon[]) {


}