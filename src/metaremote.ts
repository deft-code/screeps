import {
    MetaStructure, MetaManager, MetaMem, addMemStruct, registerMeta, getMetaManager,
} from "metastruct";
import {
    kPathRoad, kPathPlain, kPathSwamp, kPlannedRoad, kNoRoad, kShared, TrafficMem,
    avoidAround, pathTraffic,
} from "metatraffic";
import { coordsFromXY, toXY, defaultRewalker, Goal } from "Rewalker";
import * as debug from "debug";

// Metas planned by the Remote mission (ms.remote.ts) rather than by genesis
// flags. They live in the normal per-room meta memory so ActiveStrat (unowned
// rooms) and ClaimedStrat (the home room) build and repair them like any other
// meta; the roads are the room's traffic plan (MetaManager.updateTraffic),
// planned from the rroad metas' entries. Everything is at level 0: an unowned
// room's roomLevel is 0. The planner's matrices keep roads off the harvest and
// reserve spots with metatraffic's kAvoid ring (avoidAround), and pull later
// legs onto an earlier one's plain tiles with kShared.

// Genesis flags cannot re-plan mission metas; planMeta() gets null.
function noPlan() { return null; }

// One per source in the remote room, named rsrc_<source xy>. Holds the
// container tile, the standing point "rsrc" on it, and answers targetid()
// with the source, mirroring Meta_asrc.
@registerMeta
export class Meta_rsrc extends MetaStructure {
    static plan = noPlan;

    static make(man: MetaManager, src: Source, cont: RoomPosition): Meta_rsrc {
        const mem: MetaMem = {
            name: `rsrc_${toXY(src.pos)}`,
            xy: toXY(src.pos),
            color: COLOR_WHITE,
            priority: 1,
            structs: {},
            points: {},
        };
        addMemStruct(mem, STRUCTURE_CONTAINER, 0, toXY(cont));
        const meta = new this(mem, man);
        meta.myspot = toXY(cont);
        return meta;
    }

    targetid<S extends AnyStructure>(): Id<S> {
        const room = this.room;
        if (!room) return super.targetid<S>();
        const [x, y] = coordsFromXY(this.mem.xy);
        const src = _.first(room.lookForAt(LOOK_SOURCES, x, y));
        if (!src) return super.targetid<S>();
        return src.id as unknown as Id<S>;
    }
}

// One leg's traffic inside one room, named rroad_<remote room>_<leg>: the
// entries (mem.traffic, pathTraffic) the room's MetaManager plans roads for,
// together with every other meta's. A source leg spanning three rooms makes
// three of these; the controller leg makes one, in the remote room. Startup
// (ms.startup.ts) makes them too, leg "startup".
@registerMeta
export class Meta_rroad extends MetaStructure {
    static plan = noPlan;

    static make(man: MetaManager, remote: string, leg: string, entries: TrafficMem[]): Meta_rroad {
        const mem: MetaMem = {
            name: `rroad_${remote}_${leg}`,
            xy: entries[0].dest,
            color: COLOR_WHITE,
            priority: 0,
            structs: {},
            points: {},
            traffic: entries,
        };
        return new this(mem, man);
    }
}

export interface LegResult {
    leg: string
    metas: MetaStructure[]
    incomplete: boolean
    steps: number
    ops: number
}

// Plans the roads of one remote room: a leg from each source back to the home
// storage, paved end to end through every room, and a leg from the controller
// that is paved only on swamp and only inside the remote room. Legs share
// per-room cost matrices so later legs prefer earlier corridors and never
// cross the chosen container tiles. A leg's output is its ends in each room
// (pathTraffic): storage -> the border it enters home by, border to border in
// between, the border it leaves the remote by -> beside the container (or the
// controller); each room's MetaManager then plans the roads. Create one, call
// sources() with the remote's sources and controller(), then commit with
// saveAll().
export class RemotePlanner {
    readonly allowed = new Set<string>();
    readonly mats = new Map<string, CostMatrix>();
    readonly metas: MetaStructure[] = [];
    readonly storage: RoomPosition;
    // Steps of the longest complete source leg; the trucker's one-way trip.
    longestLeg = 0;

    constructor(readonly home: string, readonly remote: string) {
        const store = getMetaManager(home).getSite(STRUCTURE_STORAGE) || Game.rooms[home]?.storage?.pos;
        if (!store) throw new Error(`RemotePlanner: ${home} has no storage`);
        this.storage = store;
        this.allowed.add(home).add(remote);
        const route = Game.map.findRoute(remote, home);
        if (route !== ERR_NO_PATH) for (const step of route) this.allowed.add(step.room);
    }

    // Cost matrix for one room, built once per planner. Every structure that
    // is not a road or rampart is impassable so a road is never planned onto
    // something the upkeep would then destroy as a blocker.
    matrix(roomName: string): CostMatrix {
        let cm = this.mats.get(roomName);
        if (cm) return cm;
        cm = new PathFinder.CostMatrix();
        const room = Game.rooms[roomName];
        if (room) {
            for (const s of room.find(FIND_STRUCTURES)) {
                if (s.structureType === STRUCTURE_RAMPART) continue;
                cm.set(s.pos.x, s.pos.y, s.structureType === STRUCTURE_ROAD ? kPathRoad : 0xFF);
            }
            for (const s of room.find(FIND_CONSTRUCTION_SITES)) {
                if (s.structureType === STRUCTURE_RAMPART) continue;
                // Our own container and road sites are usually the previous
                // plan's, removed this very tick by planMetas(true); do not
                // let them block the replan.
                if (s.my && (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD)) continue;
                cm.set(s.pos.x, s.pos.y, s.structureType === STRUCTURE_ROAD ? kPathRoad : 0xFF);
            }
        } else {
            // No vision: reuse what Rewalker remembers of the room (0xff blocks, 1 roads).
            const old = defaultRewalker().getMatrix(roomName);
            for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) {
                const v = old.get(x, y);
                if (v === 0xFF) cm.set(x, y, 0xFF);
                else if (v === 1) cm.set(x, y, kPathRoad);
            }
        }
        if (roomName === this.home) {
            // Planned base structures block, planned base roads attract.
            const planned = getMetaManager(this.home).getMatrix();
            for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) {
                const v = planned.get(x, y);
                if (v >= 0xFE) cm.set(x, y, 0xFF);
                else if (v === kPlannedRoad && cm.get(x, y) < 0xFF) cm.set(x, y, kPathRoad);
            }
        }
        if (roomName === this.remote) {
            const t = Game.map.getRoomTerrain(roomName);
            const r = Game.rooms[roomName];
            if (r) {
                for (const src of r.find(FIND_SOURCES)) avoidAround(cm, t, src.pos);
                if (r.controller) avoidAround(cm, t, r.controller.pos);
            }
        }
        this.mats.set(roomName, cm);
        return cm;
    }

    search(from: RoomPosition, goals: Goal[], remoteMat?: CostMatrix) {
        return PathFinder.search(from, goals, {
            plainCost: kPathPlain,
            swampCost: kPathSwamp,
            heuristicWeight: kPathRoad,
            maxRooms: this.allowed.size + 1,
            maxOps: 4000 * this.allowed.size,
            roomCallback: roomName => {
                if (!this.allowed.has(roomName)) return false;
                if (remoteMat && roomName === this.remote) return remoteMat;
                return this.matrix(roomName);
            },
        });
    }

    // Open (non-wall) neighbours of a tile.
    openAround(t: RoomTerrain, x: number, y: number): number {
        let open = 0;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            if (!(t.get(x + ox, y + oy) & TERRAIN_MASK_WALL)) open++;
        }
        return open;
    }

    // Plan every source leg, the most cramped source first so a source with a
    // single open neighbour is never boxed in by another source's container.
    sources(srcs: Source[]): LegResult[] {
        this.srcs = srcs;
        const t = Game.map.getRoomTerrain(this.remote);
        const order = _.sortBy(srcs, src => this.openAround(t, src.pos.x, src.pos.y));
        return order.map(src => this.source(src));
    }
    srcs: Source[] = [];

    // Meta_asrc's trick: weight the source's neighbours by openness and path
    // to storage; the first step is the container tile and the rest the road.
    // Tiles that also touch another source keep their kAvoid cost.
    source(src: Source): LegResult {
        const leg = `${toXY(src.pos)}`;
        const t = Game.map.getRoomTerrain(this.remote);
        const base = this.matrix(this.remote);
        const cm = base.clone();
        const others = this.srcs.filter(o => o.id !== src.id);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const x = src.pos.x + dx, y = src.pos.y + dy;
            if (t.get(x, y) & TERRAIN_MASK_WALL) continue;
            if (base.get(x, y) === 0xFF) continue;
            if (_.any(others, o => o.pos.inRangeTo(x, y, 1))) continue;
            // 20 - open neighbours: open tiles are cheap, cramped ones dear.
            cm.set(x, y, 20 - this.openAround(t, x, y));
        }
        const ret = this.search(src.pos, [{ pos: this.storage, range: 1 }], cm);
        const cont = ret.path[0];
        const result: LegResult = { leg, metas: [], incomplete: ret.incomplete, steps: ret.path.length, ops: ret.ops };
        if (!cont || ret.incomplete) return result;

        this.longestLeg = Math.max(this.longestLeg, ret.path.length);
        // The container tile is off limits to every later leg.
        base.set(cont.x, cont.y, 0xFF);
        this.stamp(ret.path.slice(1), false);
        result.metas.push(Meta_rsrc.make(getMetaManager(this.remote), src, cont));
        // Roads to beside the container, all of them from level 0.
        const far = [{ dest: cont, range: 1, rcl: 0, swamp: 0 }];
        result.metas.push(...this.legMetas(leg, pathTraffic(ret.path, far, this.home, 0, 0)));
        this.metas.push(...result.metas);
        return result;
    }

    // Paths to the home storage like a source leg so it joins the source
    // corridors, but only inside the remote room and only on swamp.
    controller(ctrl: StructureController): LegResult {
        const leg = "ctrl";
        const ret = this.search(ctrl.pos, [{ pos: this.storage, range: 1 }]);
        const result: LegResult = { leg, metas: [], incomplete: ret.incomplete, steps: ret.path.length, ops: ret.ops };
        if (ret.incomplete) return result;
        this.stamp(ret.path.filter(p => p.roomName === this.remote), true);
        const far = [{ dest: ctrl.pos, range: 1, rcl: kNoRoad, swamp: 0 }];
        result.metas.push(...this.legMetas(leg, pathTraffic(ret.path, far, null, 0, 0, true)));
        this.metas.push(...result.metas);
        return result;
    }

    // Every step becomes a road in the planner's room matrices (only swamp
    // steps when swampOnly; the others pull gently) so later legs share the
    // corridor and its room crossings.
    stamp(path: RoomPosition[], swampOnly: boolean) {
        for (const p of path) {
            if (p.x === 0 || p.y === 0 || p.x === 49 || p.y === 49) continue;
            const cm = this.matrix(p.roomName);
            if (cm.get(p.x, p.y) === 0xFF) continue;
            const t = Game.map.getRoomTerrain(p.roomName);
            if (!swampOnly || t.get(p.x, p.y) & TERRAIN_MASK_SWAMP) {
                cm.set(p.x, p.y, kPathRoad);
            } else if (cm.get(p.x, p.y) === 0) {
                cm.set(p.x, p.y, kShared);
            }
        }
    }

    // One Meta_rroad per room holding that room's entries of the leg.
    legMetas(leg: string, byRoom: Map<string, TrafficMem[]>): Meta_rroad[] {
        const out: Meta_rroad[] = [];
        for (const [roomName, entries] of byRoom) {
            if (!entries.length) continue;
            out.push(Meta_rroad.make(getMetaManager(roomName), this.remote, leg, entries));
        }
        return out;
    }

    // Commit every planned meta to its room's manager and memory.
    // Returns room -> meta names for the mission to track.
    saveAll(): { [room: string]: string[] } {
        const tracked: { [room: string]: string[] } = {};
        const touched = new Set<MetaManager>();
        for (const meta of this.metas) {
            meta.manager.setMeta(meta);
            touched.add(meta.manager);
            (tracked[meta.manager.name] = tracked[meta.manager.name] || []).push(meta.name);
        }
        for (const man of touched) man.save();
        debug.log("RemotePlanner", this.remote, "saved", JSON.stringify(tracked));
        return tracked;
    }
}
