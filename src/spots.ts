import { toXY, fromXY } from "Rewalker";


const gSpots = new Map<string, readonly RoomPosition[]>();
const gBestSpots = new Map<string, RoomPosition>();

export function getSpots(pos: RoomPosition): readonly Readonly<RoomPosition>[] {
    const key = JSON.stringify(pos);
    if (!gSpots.has(key)) {
        calcSpots(pos);
    }
    return gSpots.get(key)!;
}

export function getBestSpot(pos: RoomPosition): RoomPosition {
    const key = JSON.stringify(pos);
    if (!gBestSpots.has(key)) {
        calcSpots(pos);
    }
    return gBestSpots.get(key)!;
}

function calcScore(rec: RoomPosition, pos: RoomPosition, t: RoomTerrain): number {
    let score = 0;
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            const n = new RoomPosition(pos.x + x, pos.y + y, pos.roomName);
            if (t.get(n.x, n.y) & TERRAIN_MASK_WALL) continue;
            if (n.isNearTo(rec)) {
                score += 1;
            } else {
                score += 10;
            }
        }
    }
    return score;
}

function calcSpots(pos: RoomPosition) {
    let bestScore = -1;
    let best = pos; // this will be overridden.
    let spots = []
    const t = Game.map.getRoomTerrain(pos.roomName);
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            if (x === 0 && y === 0) continue;
            const n = Object.freeze(new RoomPosition(pos.x + x, pos.y + y, pos.roomName));
            if (t.get(n.x, n.y) & TERRAIN_MASK_WALL) continue;
            spots.push(n);
            const score = calcScore(pos, n, t);
            if(score>bestScore) {
                bestScore = score;
                best = n;
            }
        }
    }
    const key = JSON.stringify(pos);
    gBestSpots.set(key, best);
    gSpots.set(key, Object.freeze(spots));
}
declare global {
    interface RoomMemory {
        // roomCentroid(): packed xy (Rewalker toXY) of the mean walkable tile.
        centroid?: number
    }
}

// The middle of a room: the mean position of its non-wall tiles, rounded,
// cached in Memory.rooms[name].centroid as a packed xy. Terrain never
// changes, so the cache never expires. The tile itself may be a wall (a
// ring-shaped room); callers hold a range from it rather than stand on it.
export function roomCentroid(roomName: string): RoomPosition {
    const mem = Memory.rooms[roomName] = Memory.rooms[roomName] || ({} as RoomMemory);
    if (mem.centroid === undefined) {
        const t = Game.map.getRoomTerrain(roomName);
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (t.get(x, y) & TERRAIN_MASK_WALL) continue;
                sx += x;
                sy += y;
                n++;
            }
        }
        const pos = n ? new RoomPosition(Math.round(sx / n), Math.round(sy / n), roomName)
            : new RoomPosition(25, 25, roomName);
        mem.centroid = toXY(pos);
    }
    return fromXY(mem.centroid, roomName);
}
