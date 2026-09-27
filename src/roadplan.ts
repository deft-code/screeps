import { getMetaManager, hasMetas } from "metastruct";
import {
    kPathRoad, kPathPlain, kPathSwamp, kPlannedRoad, kShared, kNearCost, kLairCost, kLairRange, costAround,
} from "metatraffic";

import { RoomIntel, roomKind, Kind } from "intel";
import { defaultRewalker, fromXY, whoami, Goal } from "Rewalker";

// Road planning between rooms: the helpers every multi-room road planner
// shares (RemotePlanner in metaremote.ts, Startup's controller road in
// ms.startup.ts, the Experiment service in ms.experiment.ts), so they all
// plan with the weights settled in metatraffic.ts (kPathRoad/Plain/Swamp,
// kNearCost, kLairCost) over the same picture of a room. The in-room
// traffic planner (metatraffic.ts planTraffic) uses the same weights on its
// own matrix, which the metas' plan comes into as a parameter; this module
// reads that plan itself (getMetaManager), which is why it lives above
// metastruct rather than in metatraffic.
//
// This is not the Rewalker (movement): a road plan has no stuck creeps or
// danger zones to dodge, but it keeps off the tiles beside sources,
// minerals and the controller (kNearCost), away from keeper lairs
// (kLairCost within kLairRange), and out of rooms another player owns.
//
// Typical use:
//   const planner = new RoadPlanner();
//   if (!planner.route(from.roomName, to.roomName)) ...   // rooms allowed
//   const ret = planner.search(from, [{ pos: to, range: 1 }]);
//   planner.stamp(ret.path, false);   // later searches ride this one

// One planner's weights. The defaults are metatraffic's; the Experiment
// service passes its own to compare sets.
export interface RoadWeights {
    road: number
    plain: number
    swamp: number
    // Free tiles beside a source, mineral or controller.
    near: number
    // Tiles within kLairRange of a keeper lair.
    lair: number
}

export const kRoadWeights: RoadWeights = {
    road: kPathRoad,
    plain: kPathPlain,
    swamp: kPathSwamp,
    near: kNearCost,
    lair: kLairCost,
};

// findRoute cost of a keeper room, against 1 for any other: the room route
// goes around one when the detour is under two rooms.
const kRouteSK = 3;
// PathFinder's own limit on the rooms one search may enter.
const kMaxRooms = 16;
// Ops per allowed room: one holds 2500 tiles, and an admissible search
// expands each at most once.
const kOpsPerRoom = 4000;
const kMinOps = 8000;

// True when another player owns the room's controller: from vision, else
// from intel (an owner entry with rcl 0 is a reservation, which is fine).
export function ownedByOther(roomName: string): boolean {
    const room = Game.rooms[roomName];
    if (room) {
        const ctrl = room.controller;
        return !!(ctrl?.owner && !ctrl.my);
    }
    const intel = RoomIntel.get(roomName);
    if (!intel) return false;
    const owner = intel.owner;
    return !!owner && owner !== whoami() && (intel.rcl || 0) > 0;
}

// The rooms a road from one room to another may cross: the map route (rooms
// another player owns are impassable, keeper rooms dear) plus both ends.
// Null when no route exists.
export function roadRoute(fromRoom: string, toRoom: string): Set<string> | null {
    const rooms = new Set<string>([fromRoom, toRoom]);
    if (fromRoom === toRoom) return rooms;
    const route = Game.map.findRoute(fromRoom, toRoom, {
        routeCallback: roomName => {
            if (ownedByOther(roomName)) return Infinity;
            return roomKind(roomName) === Kind.SourceKeeper ? kRouteSK : 1;
        },
    });
    if (route === ERR_NO_PATH) return null;
    for (const step of route) rooms.add(step.room);
    return rooms;
}

// A road plan's cost matrix for one room. Terrain is left to
// plainCost/swampCost; the roads the room's metas plan (its traffic plan
// included) cost w.road, planned structures and standing spots block, every
// other structure blocks (a road is never planned onto something the upkeep
// would then destroy as a blocker) but a rampart (ours or public), the
// controller and extractor, which sit on tiles a road may not need anyway,
// and roads and containers: a road that is built but in no plan is just its
// terrain, so a route left to decay cannot hold a replan to it, and a built
// container is a tile a replan may keep (RemotePlanner.source prefers it).
// Our own container and road sites do not block either: in a remote they
// are the previous plan's, removed by the replan. The free tiles beside sources, minerals and the
// controller cost w.near, the tiles around a keeper lair w.lair. Without
// vision the sources and controller come from intel, and what the Rewalker
// remembers of the room supplies its blocks (minerals and lairs are not
// recorded, so an unseen keeper room is only dear in the room route).
export function roadMatrix(roomName: string, w: RoadWeights = kRoadWeights): CostMatrix {
    const cm = new PathFinder.CostMatrix();
    const t = Game.map.getRoomTerrain(roomName);
    const near = Math.min(0xFD, w.near);
    const lair = Math.min(0xFD, w.lair);
    const room = Game.rooms[roomName];
    const spots: RoomPosition[] = [];
    if (room) {
        for (const s of room.find(FIND_STRUCTURES)) {
            const { x, y } = s.pos;
            switch (s.structureType) {
                case STRUCTURE_ROAD:
                case STRUCTURE_CONTAINER:
                    break;
                case STRUCTURE_RAMPART:
                    if (!(s as StructureRampart).my && !(s as StructureRampart).isPublic) cm.set(x, y, 0xFF);
                    break;
                case STRUCTURE_CONTROLLER:
                case STRUCTURE_EXTRACTOR:
                case STRUCTURE_KEEPER_LAIR:
                    break;
                default:
                    cm.set(x, y, 0xFF);
                    break;
            }
        }
        for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
            const { x, y } = site.pos;
            if (site.structureType === STRUCTURE_RAMPART) continue;
            if (site.my && (site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER)) continue;
            cm.set(x, y, 0xFF);
        }
        spots.push(...room.find(FIND_SOURCES).map(s => s.pos));
        spots.push(...room.find(FIND_MINERALS).map(m => m.pos));
        if (room.controller) spots.push(room.controller.pos);
        for (const l of room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_KEEPER_LAIR })) {
            costAround(cm, t, l.pos, kLairRange, lair);
            cm.set(l.pos.x, l.pos.y, 0xFF);
        }
    } else {
        // What the Rewalker remembers: 0xFF blocks (its roads, 1, and
        // stuck-creep costs are not a plan's and are dropped).
        const old = defaultRewalker().getMatrix(roomName);
        for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) {
            if (old.get(x, y) === 0xFF) cm.set(x, y, 0xFF);
        }
        const intel = RoomIntel.get(roomName);
        if (intel) {
            for (const xy of intel.mem.src || []) spots.push(fromXY(xy, roomName));
            if (intel.mem.ctrl !== undefined) spots.push(fromXY(intel.mem.ctrl, roomName));
        }
    }
    for (const pos of spots) costAround(cm, t, pos, 1, near);
    if (hasMetas(roomName)) {
        const planned = getMetaManager(roomName).getMatrix();
        for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) {
            const v = planned.get(x, y);
            if (!v) continue;
            if (v >= 0xFE) cm.set(x, y, 0xFF);
            else if (v === kPlannedRoad && cm.get(x, y) < 0xFE) cm.set(x, y, w.road);
        }
    }
    return cm;
}

export interface RoadSearchOpts {
    // In place of the planner's matrix for that one room.
    override?: { room: string, cm: CostMatrix }
    maxOps?: number
}

// One multi-room plan: the rooms it may cross (route(), allow()) and their
// matrices (built once each, roadMatrix). Searches share the matrices, and
// stamp() lays a found path into them so later searches coalesce with it.
export class RoadPlanner {
    readonly allowed = new Set<string>();
    readonly mats = new Map<string, CostMatrix>();

    constructor(readonly w: RoadWeights = kRoadWeights) { }

    // A plain tile a stamped path walks without a road: kShared under the
    // settled weights, just under plain under any other.
    get shared(): number {
        return Math.min(kShared, Math.max(this.w.road, this.w.plain - 1));
    }

    allow(...rooms: string[]): this {
        for (const r of rooms) this.allowed.add(r);
        return this;
    }

    // Allow the road route between two rooms (roadRoute). False, with only
    // the two ends allowed, when the map has no route.
    route(fromRoom: string, toRoom: string): boolean {
        const rooms = roadRoute(fromRoom, toRoom);
        this.allow(fromRoom, toRoom);
        if (!rooms) return false;
        for (const r of rooms) this.allowed.add(r);
        return true;
    }

    matrix(roomName: string): CostMatrix {
        let cm = this.mats.get(roomName);
        if (!cm) {
            cm = roadMatrix(roomName, this.w);
            this.mats.set(roomName, cm);
        }
        return cm;
    }

    search(from: RoomPosition, goals: Goal[], opts: RoadSearchOpts = {}): PathFinderPath {
        const n = this.allowed.size;
        return PathFinder.search(from, goals, {
            plainCost: this.w.plain,
            swampCost: this.w.swamp,
            heuristicWeight: this.w.road,
            maxRooms: Math.min(kMaxRooms, n),
            maxOps: opts.maxOps || Math.max(kMinOps, kOpsPerRoom * n),
            roomCallback: roomName => {
                if (!this.allowed.has(roomName)) return false;
                if (opts.override && roomName === opts.override.room) return opts.override.cm;
                return this.matrix(roomName);
            },
        });
    }

    // Every step becomes a road in the planner's matrices (only swamp steps
    // when swampOnly; the others pull gently at kShared) so later searches
    // share the corridor and its room crossings. Exit tiles and blocked
    // tiles are left alone.
    stamp(path: RoomPosition[], swampOnly: boolean) {
        for (const p of path) {
            if (p.x === 0 || p.y === 0 || p.x === 49 || p.y === 49) continue;
            const cm = this.matrix(p.roomName);
            if (cm.get(p.x, p.y) >= 0xFE) continue;
            const t = Game.map.getRoomTerrain(p.roomName);
            if (!swampOnly || t.get(p.x, p.y) & TERRAIN_MASK_SWAMP) {
                cm.set(p.x, p.y, this.w.road);
            } else if (cm.get(p.x, p.y) === 0) {
                cm.set(p.x, p.y, this.shared);
            }
        }
    }
}
