// The entrances of a room: each run of adjacent exit tiles along one edge,
// as the edge it is on and the inclusive range of tile numbers along it (x
// for top and bottom, y for left and right). A wall tile ends a run; the
// corners are always wall. Terrain only, so no vision is needed, and the
// answer is kept per room on the heap (terrain never changes).
//
// Shared by whatever reasons about a room's ways in: Meta_bubble
// (metabubble.ts) seals each one and gates the road through it.
export type EntranceDir = "top" | "bottom" | "left" | "right";

export interface Entrance {
    dir: EntranceDir
    from: number
    to: number
}

const kDirs: EntranceDir[] = ["top", "bottom", "left", "right"];
const memo = new Map<string, Entrance[]>();

// The x, y of tile `i` along an edge.
export function edgeXY(dir: EntranceDir, i: number): [number, number] {
    switch (dir) {
        case "top": return [i, 0];
        case "bottom": return [i, 49];
        case "left": return [0, i];
        case "right": return [49, i];
    }
}

export function edgeTile(dir: EntranceDir, i: number, roomName: string): RoomPosition {
    const [x, y] = edgeXY(dir, i);
    return new RoomPosition(x, y, roomName);
}

export function roomEntrances(roomName: string): Entrance[] {
    const hit = memo.get(roomName);
    if (hit) return hit;
    const t = Game.map.getRoomTerrain(roomName);
    const out: Entrance[] = [];
    for (const dir of kDirs) {
        let from = -1;
        for (let i = 0; i <= 50; i++) {
            let open = false;
            if (i < 50) {
                const [x, y] = edgeXY(dir, i);
                open = !(t.get(x, y) & TERRAIN_MASK_WALL);
            }
            if (open && from < 0) {
                from = i;
            } else if (!open && from >= 0) {
                out.push({ dir, from, to: i - 1 });
                from = -1;
            }
        }
    }
    memo.set(roomName, out);
    return out;
}

// The exit tiles of an entrance.
export function entranceTiles(e: Entrance, roomName: string): RoomPosition[] {
    const out: RoomPosition[] = [];
    for (let i = e.from; i <= e.to; i++) out.push(edgeTile(e.dir, i, roomName));
    return out;
}

// Its middle exit tile.
export function entranceMiddle(e: Entrance, roomName: string): RoomPosition {
    return edgeTile(e.dir, Math.floor((e.from + e.to) / 2), roomName);
}

// Every exit tile of the room, by terrain.
export function roomExitTiles(roomName: string): RoomPosition[] {
    return _.flatten(roomEntrances(roomName).map(e => entranceTiles(e, roomName)));
}

export function describeEntrance(e: Entrance): string {
    return `${e.dir} ${e.from}-${e.to}`;
}

// How far a tile is from the nearest room edge: 0 on an exit tile.
export function edgeRange(pos: RoomPosition): number {
    return Math.min(pos.x, pos.y, 49 - pos.x, 49 - pos.y);
}
