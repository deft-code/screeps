import { coordsToXY, coordsFromXY, fromXY, toXY, Goal } from "Rewalker";
import { canRun } from "shed";

// Road planning for MetaManager (metastruct.ts). Metas declare traffic
// entries, pairs of tiles in their room to connect; the room's manager plans
// roads for all of them together so they coalesce, and keeps the result as its
// traffic plan. This module is the planner itself and imports only Rewalker
// and shed, so metastruct can import it (docs/traffic-design.md).

// Path costs for every meta planner. Roads are cheapest so paths coalesce onto
// them; heuristicWeight kPathRoad keeps the search admissible.
export const kPathRoad = 7;
export const kPathPlain = 11;
export const kPathSwamp = 12;

// A plan level no room reaches: an entry with rcl kNoRoad gets no roads on
// plain. Above 9 (optional), so the lowest level wins where entries share a tile.
export const kNoRoad = 10;
// Level of the base metas' roads and of the rings.
export const kTrafficLevel = 3;
export const kRingLevel = 3;
// src of an entry that starts at the room's traffic origin (the planned
// storage, else the genesis flag), resolved when the traffic is planned so a
// moved storage moves the road (MetaManager.getTraffic).
export const kOrigin = -1;
// A swamp tile's path cost for an entry that should stay off swamp where it
// can: a swamp road costs CONSTRUCTION_COST_ROAD_SWAMP_RATIO times a plain one
// to build and to keep (Startup's roads).
export const kSwampAverse = kPathPlain * CONSTRUCTION_COST_ROAD_SWAMP_RATIO;
// Plans keep the bucket at this or above while they run, and start only with
// kTrafficHeadroom more, so a plan is not begun that the gate will cut short.
export const kTrafficBucket = 8000;
export const kTrafficHeadroom = 1000;

// Free tiles beside sources and the controller in rooms we do not own (the
// harvest and reserve spots): passable, but only as a last resort.
export const kAvoid = 0xF0;
// The cost ladder below plain, so replans reuse what is built and break ties
// toward what is planned instead of churning between equal routes: a built
// road some plan holds (another meta's, or the traffic plan being replaced)
// costs kPathRoad like a road just laid; a built road no plan holds (an older
// route left to decay) one more; a planned road not built yet (fillMatrix's
// 10) a little under plain.
const kLooseRoad = kPathRoad + 1;
export const kPlannedRoad = 10;
// A plain tile a kNoRoad path walks: pulls later paths gently onto the same
// corridor without pretending it is a road.
export const kShared = kPathPlain - 1;
// Exit tiles can hold no road, and a path walking along them gets bounced
// between rooms: passable only as an entry's own end.
const kExitCost = 0xFE;
// One room holds 2500 tiles; an admissible search expands each at most once.
const kTrafficOps = 4000;

// One road a meta wants: from src (a tile, or kOrigin) to within range of
// dest, both in the meta's room. Plain tiles are built from plan level rcl,
// swamp tiles from swamp (default rcl); kNoRoad for never. swampCost, when
// set, is what an unroaded swamp tile costs this entry's search (default
// kPathSwamp).
export interface TrafficMem {
    src: number
    dest: number
    range?: number
    rcl: number
    swamp?: number
    swampCost?: number
}

export function trafficRange(e: TrafficMem): number {
    return e.range || 0;
}

export function trafficSwamp(e: TrafficMem): number {
    return e.swamp === undefined ? e.rcl : e.swamp;
}

function trafficSwampCost(e: TrafficMem): number {
    return e.swampCost || kPathSwamp;
}

function isXY(xy: unknown): boolean {
    if (typeof xy !== "number" || !Number.isInteger(xy)) return false;
    const [x, y] = coordsFromXY(xy);
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function isLevel(lvl: unknown): boolean {
    return typeof lvl === "number" && Number.isInteger(lvl) && lvl >= 0 && lvl <= kNoRoad;
}

// A well formed entry with its src resolved: tiles in the room, levels
// 0..kNoRoad, range >= 0, a swamp cost PathFinder takes (1..254).
export function validTraffic(e: TrafficMem): boolean {
    if (!e || !isXY(e.src) || !isXY(e.dest) || !isLevel(e.rcl)) return false;
    if (e.swamp !== undefined && !isLevel(e.swamp)) return false;
    if (e.swampCost !== undefined && !(Number.isInteger(e.swampCost) && e.swampCost >= 1 && e.swampCost < 0xFF)) return false;
    return e.range === undefined || (Number.isInteger(e.range) && e.range >= 0);
}

export function describeTraffic(e: TrafficMem): string {
    const cost = e.swampCost ? `$${e.swampCost}` : "";
    return `${e.src}>${e.dest}~${trafficRange(e)}@${e.rcl}/${trafficSwamp(e)}${cost}`;
}

// 32-bit FNV-1a of a string, base 36: a short signature for plan inputs.
export function hashString(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

function atEdge(x: number, y: number): boolean {
    return x <= 0 || y <= 0 || x >= 49 || y >= 49;
}

// kAvoid on the free tiles around `pos`: terrain walls and blocked tiles
// (0xFE and up) keep their cost. Shared with RemotePlanner.
export function avoidAround(cm: CostMatrix, t: RoomTerrain, pos: RoomPosition) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const x = pos.x + dx, y = pos.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        if (t.get(x, y) & TERRAIN_MASK_WALL) continue;
        if (cm.get(x, y) >= 0xFE) continue;
        cm.set(x, y, kAvoid);
    }
}

// The matrix a room's traffic is planned on. `planned` is the metas' own
// (MetaManager.getMatrix without the traffic plan: standing spots 0xFE,
// structures 0xFF, roads 10). With vision the room's contents go over it:
// anything a road site could not share a tile with blocks (a container too:
// the upkeep would destroy it as a blocker), and roads go on the cost ladder
// above, with `previous` (the traffic plan being replaced) counting as
// planned. A terrain wall keeps cost 0, since any other cost would make it
// walkable, unless a built road tunnels through it.
export function trafficMatrix(roomName: string, planned: CostMatrix, previous: number[] = []): CostMatrix {
    const t = Game.map.getRoomTerrain(roomName);
    const room = Game.rooms[roomName];
    const block = new Set<number>();
    const roads = new Set<number>();
    if (room) {
        for (const s of room.find(FIND_STRUCTURES)) {
            const xy = coordsToXY(s.pos.x, s.pos.y);
            if (s.structureType === STRUCTURE_ROAD) {
                roads.add(xy);
            } else if (s.structureType === STRUCTURE_RAMPART) {
                const r = s as StructureRampart;
                if (!r.my && !r.isPublic) block.add(xy);
            } else {
                block.add(xy);
            }
        }
        for (const s of room.find(FIND_CONSTRUCTION_SITES)) {
            // Our road sites are a plan's own roads-to-be, and a road can go
            // under our rampart site. Any other site keeps a road site off.
            if (s.my && (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART)) continue;
            block.add(coordsToXY(s.pos.x, s.pos.y));
        }
        const obstacles: RoomObject[] = [...room.find(FIND_SOURCES), ...room.find(FIND_MINERALS), ...room.find(FIND_DEPOSITS)];
        for (const o of obstacles) block.add(coordsToXY(o.pos.x, o.pos.y));
    }

    const prev = new Set(previous);
    const cm = new PathFinder.CostMatrix();
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            const xy = coordsToXY(x, y);
            let v = planned.get(x, y);
            const plannedRoad = v === kPlannedRoad || prev.has(xy);
            if (t.get(x, y) & TERRAIN_MASK_WALL) {
                if (roads.has(xy) && !block.has(xy)) cm.set(x, y, plannedRoad ? kPathRoad : kLooseRoad);
                continue;
            }
            if (block.has(xy)) v = 0xFF;
            else if (v < 0xFE && roads.has(xy)) v = plannedRoad ? kPathRoad : kLooseRoad;
            else if (v < 0xFE && plannedRoad) v = kPlannedRoad;
            if (atEdge(x, y) && v < 0xFE) v = kExitCost;
            if (v) cm.set(x, y, v);
        }
    }

    if (room && !room.controller?.my) {
        for (const src of room.find(FIND_SOURCES)) avoidAround(cm, t, src.pos);
        if (room.controller) avoidAround(cm, t, room.controller.pos);
    }
    return cm;
}

export interface TrafficResult {
    // Planned road tiles (xy) -> plan level, in the order they were laid.
    roads: Map<number, number>
    // Entries whose search reached no goal; their partial path was laid.
    fail: TrafficMem[]
}

// Plan the roads for `entries` (srcs resolved) in `roomName` on `cm`
// (trafficMatrix; it is modified). First a ring of kRingLevel roads on the
// free neighbours of every tile in `rings` (storage, terminal, spawns), then
// the entries grouped by (src, rcl, swamp, swampCost) in order. Per group:
// search from src to every open entry's dest at once, close
// the entries the path ends in range of, lay the path at the group's levels
// and stamp it kPathRoad so later paths coalesce onto it; repeat until the
// group is done. The order roads are laid in is the order they are built in:
// from each path's src outward, or with `fromDest` (rooms we do not own, where
// our creeps work at the far ends: miners at the containers) from its dest
// back. Null when the CPU gate stopped it: nothing of a partial plan is kept.
export function planTraffic(roomName: string, cm: CostMatrix, rings: number[], entries: TrafficMem[],
    fromDest = false): TrafficResult | null {
    const t = Game.map.getRoomTerrain(roomName);
    const roads = new Map<number, number>();
    const fail: TrafficMem[] = [];

    const lay = (x: number, y: number, lvl: number) => {
        if (atEdge(x, y)) return;
        const xy = coordsToXY(x, y);
        const was = roads.get(xy);
        if (was === undefined || lvl < was) roads.set(xy, lvl);
        // A standing spot a path had to cross stays dear for the rest.
        if (cm.get(x, y) < 0xFE) cm.set(x, y, kPathRoad);
    };

    for (const xy of rings) {
        const [px, py] = coordsFromXY(xy);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const x = px + dx, y = py + dy;
            if (atEdge(x, y)) continue;
            if (t.get(x, y) & TERRAIN_MASK_WALL) continue;
            if (cm.get(x, y) >= 0xFE) continue;
            lay(x, y, kRingLevel);
        }
    }

    const groups = new Map<string, TrafficMem[]>();
    for (const e of entries) {
        const key = `${e.src}:${e.rcl}:${trafficSwamp(e)}:${trafficSwampCost(e)}`;
        let group = groups.get(key);
        if (!group) groups.set(key, group = []);
        group.push(e);
    }

    for (const group of groups.values()) {
        const src = fromXY(group[0].src, roomName);
        const rcl = group[0].rcl;
        const swamp = trafficSwamp(group[0]);
        const levelAt = (x: number, y: number) => (t.get(x, y) & TERRAIN_MASK_SWAMP) ? swamp : rcl;
        // A road covers both of its ends, but PathFinder leaves the origin out
        // of its path: src goes with the group's first path when a road can
        // stand on it (a storage or spawn src is blocked, a border src is an
        // exit).
        let srcDone = atEdge(src.x, src.y) || !!(t.get(src.x, src.y) & TERRAIN_MASK_WALL) || cm.get(src.x, src.y) >= 0xFE;
        const open = group.slice();
        while (open.length) {
            if (!canRun(Game.cpu.getUsed(), kTrafficBucket)) return null;
            const goals: Goal[] = open.map(e => ({ pos: fromXY(e.dest, roomName), range: trafficRange(e) }));
            const ret = PathFinder.search(src, goals, {
                plainCost: kPathPlain,
                swampCost: trafficSwampCost(group[0]),
                heuristicWeight: kPathRoad,
                maxRooms: 1,
                maxOps: kTrafficOps,
                roomCallback: name => name === roomName ? cm : false,
            });
            const last = ret.path.length ? ret.path[ret.path.length - 1] : src;
            let done = open.filter(e => last.inRangeTo(fromXY(e.dest, roomName), trafficRange(e)));
            let laid = true;
            if (!done.length) {
                // Nothing reachable: the nearest entry is closed as failed, so
                // the loop always ends. Its partial path is laid only when it
                // got next to the goal (the dest tile itself was blocked), not
                // when it ran into a dead end short of a walled-off one.
                let nearest = open[0];
                for (const e of open) {
                    if (last.getRangeTo(fromXY(e.dest, roomName)) < last.getRangeTo(fromXY(nearest.dest, roomName))) nearest = e;
                }
                done = [nearest];
                fail.push(nearest);
                laid = last.getRangeTo(fromXY(nearest.dest, roomName)) <= trafficRange(nearest) + 1;
            }
            for (const e of done) open.splice(open.indexOf(e), 1);
            if (!laid) continue;
            const steps = ret.path.filter(p => p.roomName === roomName);
            if (!srcDone) {
                steps.unshift(src);
                srcDone = true;
            }
            if (fromDest) steps.reverse();
            for (const p of steps) {
                const lvl = levelAt(p.x, p.y);
                if (lvl < kNoRoad) lay(p.x, p.y, lvl);
                else if (cm.get(p.x, p.y) === 0) cm.set(p.x, p.y, kShared);
            }
        }
    }
    return { roads, fail };
}

// A multi-room path's stay in each room it crosses, in path order.
export interface Span {
    room: string
    first: RoomPosition
    last: RoomPosition
}

export function roomSpans(path: RoomPosition[]): Span[] {
    const spans: Span[] = [];
    for (const p of path) {
        const cur = spans[spans.length - 1];
        if (cur && cur.room === p.roomName) cur.last = p;
        else spans.push({ room: p.roomName, first: p, last: p });
    }
    return spans;
}

// A far end of a mission road: the source container, the controller.
export interface FarTarget {
    dest: RoomPosition
    range: number
    rcl: number
    swamp: number
}

// The traffic entries of a multi-room road, by room. `path` runs from the far
// end toward home (PathFinder order: the search origin is not in it). Entries
// point home-side -> far-side: in the far room (the path's first) one per
// `far` target from the tile the path leaves by; in every room between, from
// the tile it enters by from home to the tile it leaves by; in `home` (the
// last room, when the path got there) from the room's traffic origin
// (kOrigin: its storage) to the tile it enters by. Those in-between and home
// entries are at rcl/swamp. `farOnly` keeps only the far room's.
export function pathTraffic(path: RoomPosition[], far: FarTarget[], home: string | null,
    rcl: number, swamp: number, farOnly = false): Map<string, TrafficMem[]> {
    const out = new Map<string, TrafficMem[]>();
    const add = (room: string, e: TrafficMem) => {
        let list = out.get(room);
        if (!list) out.set(room, list = []);
        list.push(e);
    };
    const spans = roomSpans(path);
    spans.forEach((span, i) => {
        if (i === 0) {
            for (const f of far) {
                if (f.dest.roomName !== span.room) continue;
                add(span.room, { src: toXY(span.last), dest: toXY(f.dest), range: f.range, rcl: f.rcl, swamp: f.swamp });
            }
            return;
        }
        if (farOnly) return;
        if (i === spans.length - 1 && span.room === home) {
            add(span.room, { src: kOrigin, dest: toXY(span.first), range: 0, rcl, swamp });
            return;
        }
        if (span.last.isEqualTo(span.first)) return;
        add(span.room, { src: toXY(span.last), dest: toXY(span.first), range: 0, rcl, swamp });
    });
    return out;
}

