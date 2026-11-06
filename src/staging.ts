import { defaultRewalker, atExit } from "Rewalker";
import { roomCenterPos } from "intel";
import * as debug from "debug";

// Staging locator (Oct 2026, written for the Assault missions; any mission
// that masses creeps in the room before its target can use it). Where a
// force waits in `staging`, the room it enters the target room from:
//
//   1. One path from the staging room's centre to the nearest of
//      `targets` (PathFinder over the Rewalker matrices, offroad costs,
//      kept to the staging and target rooms): one search over every
//      target, as Rewalker.planWalk plans one walk over many goals.
//   2. The tiles of that path on the staging room's edge: the exit it
//      leaves by. One, normally; one at random when the path touches the
//      edge more than once. The path's first tile in the target room is
//      the `entry` (the way in; the missions sort their targets by it).
//   3. From that edge tile, a flee (PathFinder flee) to kStageRange from
//      every exit tile of the staging room (terrain, so no vision needed)
//      and, in a keeper room, from every keeper lair. The last tile of the
//      flight is the staging position.
//
// null when no path reaches a target (logged). A path that never touches
// the edge (the targets are in the staging room itself) stages at the
// room's centre.
//
// Shielded rooms (1 Nov 2026): a base walled in has no path at all, and the
// locator says so. The caller then asks again with `opts.matrix` =
// hitsMatrix: a tile something of somebody else's blocks costs
// round(log10(hits) * kHitsScale) instead of being impassable (the Bulldoze
// breach's pricing, ms.bulldoze.ts), so the path runs through the cheapest
// shell, and blockers() names what stands on each of its tiles for the
// mission to shoot down in walking order.
export const kStageRange = 6;
const kPathOps = 20000;
const kPlain = 1;
const kSwamp = 5;
// Matrix cost of a blocked tile: round(log10(hits) * kHitsScale).
const kHitsScale = 20;

export interface StagingOpts {
    // A matrix per room in place of the Rewalker's; undefined for a room
    // falls back to the Rewalker's.
    matrix?: (roomName: string) => CostMatrix | undefined
    maxOps?: number
}

const rewalker = defaultRewalker();

export interface Staging {
    // Where to stage.
    pos: RoomPosition
    // The edge tile the path leaves the staging room by.
    edge: RoomPosition
    // The path's first tile in the target room, null when it has none.
    entry: RoomPosition | null
    // The whole path, for drawing.
    path: RoomPosition[]
}

export function findStaging(staging: string, targets: RoomPosition[], opts: StagingOpts = {}): Staging | null {
    if (!targets.length) return null;
    const from = roomCenterPos(staging);
    const rooms = new Set<string>([staging, ...targets.map(t => t.roomName)]);
    const ret = PathFinder.search(from, targets.map(pos => ({ pos, range: 1 })), {
        plainCost: kPlain,
        swampCost: kSwamp,
        maxOps: opts.maxOps || kPathOps,
        maxRooms: rooms.size,
        roomCallback: name => rooms.has(name) ? (opts.matrix?.(name) || rewalker.getMatrix(name)) : false,
    });
    if (ret.incomplete) {
        debug.log("staging: no path from", from, "to any of", targets.length, "targets; ops", ret.ops, "steps", ret.path.length);
        return null;
    }
    const i = _.findIndex(ret.path, p => p.roomName !== staging);
    const entry = i >= 0 ? ret.path[i] : null;
    const edges = ret.path.filter(p => p.roomName === staging && atExit(p));
    if (!edges.length) {
        debug.log("staging: the path from", from, "never leaves", staging, "; staging at its centre");
        return { pos: from, edge: from, entry, path: ret.path };
    }
    const edge = _.sample(edges);
    const pos = fleeEdges(edge);
    debug.log("staging:", staging, "edge", edge, "of", edges.length, "entry", entry, "pos", pos);
    return { pos, edge, entry, path: ret.path };
}

// What `s` costs to get through, in hits: Infinity for what cannot be shot
// down (ours, no hits, an invader core or power bank); null for what is
// walked over (roads, containers, our own and public ramparts).
export function blockHits(s: Structure): number | null {
    if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) return null;
    if (s.structureType === STRUCTURE_RAMPART && ((s as StructureRampart).my || (s as StructureRampart).isPublic)) return null;
    if ((s as OwnedStructure).my || !s.hits) return Infinity;
    if (s.structureType === STRUCTURE_INVADER_CORE || s.structureType === STRUCTURE_POWER_BANK) return Infinity;
    return s.hits;
}

// The hits-weighted matrix of `roomName`: every tile something blocks
// costs round(log10(hits) * kHitsScale) (1..254), the unshootable 255;
// open tiles keep their terrain cost. undefined without vision, so the
// caller falls back to the Rewalker's matrix (findStaging opts.matrix).
export function hitsMatrix(roomName: string): CostMatrix | undefined {
    const room = Game.rooms[roomName];
    if (!room) return undefined;
    const mat = new PathFinder.CostMatrix();
    const hits = new Map<number, number>();
    for (const s of room.find(FIND_STRUCTURES)) {
        const h = blockHits(s);
        if (h === null) continue;
        const key = s.pos.x * 100 + s.pos.y;
        hits.set(key, (hits.get(key) || 0) + h);
    }
    for (const [key, h] of hits) {
        const cost = h === Infinity ? 0xff : Math.round(Math.log10(h) * kHitsScale);
        mat.set(Math.floor(key / 100), key % 100, Math.max(1, Math.min(0xfe, cost)));
    }
    return mat;
}

// What stands on `pos` that our creeps cannot walk through and could
// shoot down: a rampart that is not ours or public first (it shields the
// rest), then the obstacle structures with hits. Empty without vision.
export function blockers(pos: RoomPosition): Structure[] {
    if (!Game.rooms[pos.roomName]) return [];
    const structs = pos.lookFor(LOOK_STRUCTURES).filter(s => {
        const h = blockHits(s);
        if (h === null || h === Infinity) return false;
        return s.structureType === STRUCTURE_RAMPART || _.contains(OBSTACLE_OBJECT_TYPES, s.structureType);
    });
    return _.sortBy(structs, s => s.structureType === STRUCTURE_RAMPART ? 0 : 1);
}

// Every walkable tile on the edge of `roomName`, by terrain.
export function exitTiles(roomName: string): RoomPosition[] {
    const terrain = Game.map.getRoomTerrain(roomName);
    const out: RoomPosition[] = [];
    const add = (x: number, y: number) => {
        if (!(terrain.get(x, y) & TERRAIN_MASK_WALL)) out.push(new RoomPosition(x, y, roomName));
    };
    for (let i = 0; i < 50; i++) {
        add(i, 0);
        add(i, 49);
        if (i > 0 && i < 49) {
            add(0, i);
            add(49, i);
        }
    }
    return out;
}

// The keeper lairs of `roomName`: by sight, else what the Rewalker's keeper
// info holds of the room (the guarded tiles it rings), nothing for a room
// that is not a keeper room.
function lairs(roomName: string): RoomPosition[] {
    const room = Game.rooms[roomName];
    if (room) return room.findStructs(STRUCTURE_KEEPER_LAIR).map(s => s.pos);
    if (!rewalker.isKeeperRoom(roomName)) return [];
    return rewalker.skInfo(roomName).allPos(roomName);
}

// The tile a flight from `edge` ends on: kStageRange from every exit tile
// and lair of its room, over the Rewalker's matrix of that room alone. The
// edge tile itself when the search finds no step.
function fleeEdges(edge: RoomPosition): RoomPosition {
    const goals = [...exitTiles(edge.roomName), ...lairs(edge.roomName)].map(pos => ({ pos, range: kStageRange }));
    const ret = PathFinder.search(edge, goals, {
        flee: true,
        maxRooms: 1,
        plainCost: kPlain,
        swampCost: kSwamp,
        maxOps: kPathOps,
        roomCallback: name => name === edge.roomName ? rewalker.getMatrix(name) : false,
    });
    return _.last(ret.path) || edge;
}
