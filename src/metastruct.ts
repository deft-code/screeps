import { FlagExtra } from "flag";
import { merge } from "lib";
import { coordsToXY, coordsFromXY, toXY, fromXY, Goal } from "Rewalker";
import { canRun } from "shed";
import { isSType, isOwnedStruct } from "guards";
import { Mode } from "struct.link";
import { max } from "lodash";
import * as debug from "debug";
import {
    TrafficMem, TrafficResult, kPathRoad, kPathPlain, kPathSwamp, kPlannedRoad, kTrafficLevel, kTrafficBucket,
    kTrafficHeadroom, kOrigin, trafficMatrix, planTraffic, validTraffic, describeTraffic, hashString,
} from "metatraffic";

declare global {
    interface Flag {
        runMeta(): void
    }
    interface Room {
        meta: MetaManager
    }
    interface FlagMemory {
        newer?: any
    }
}

function calcRole(name: string): string {
    return _.words(name)[0].toLowerCase();
}

// Ticks between passes that destroy structures on retired tiles.
const kRetirePace = 10;
// Structures that decay when nobody repairs them; retire() leaves them to it.
const kDecays: StructureConstant[] = [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART];

// Name of MetaManager's traffic plan (memory.traffic), and the role of the
// genesis child flag that keeps it drawn.
const kTrafficName = "traffic";
// Bump to replan every room's traffic after the planner changes.
const kTrafficVersion = 1;
// Ticks a room waits after a traffic plan that ran out of CPU.
const kTrafficRetry = 50;
// Structures planTraffic rings with roads.
const kRingTypes: BuildableStructureConstant[] = [STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_SPAWN];
// Game.time of the last traffic plan in any room: one room plans per tick.
let trafficTick = -1;
// Rooms whose metas stopped declaring traffic in a save(), and when. Their
// plans are dropped from the next tick on unless traffic came back: Startup
// and Remote replace their road metas by removing and re-saving them within
// one tick, and the plan (its sites, and the tiles a replan prefers) should
// survive that. In memory only: the constructor's save() queues a room again
// after a global reset.
const trafficDrops = new Map<string, number>();

function flushTrafficDrops() {
    for (const [name, at] of trafficDrops) {
        if (at >= Game.time) continue;
        trafficDrops.delete(name);
        const man = managers.get(name);
        if (man && man.traffic && !man.declaresTraffic()) man.dropTraffic();
    }
}

// One MetaManager per room for the life of the global, whether or not the
// room is visible. Missions plan metas into rooms they cannot see, and two
// managers for one room would overwrite each other's lists on save().
const managers = new Map<string, MetaManager>();
export function getMetaManager(roomName: string): MetaManager {
    let man = managers.get(roomName);
    if (!man) {
        man = new MetaManager(roomName);
        managers.set(roomName, man);
    }
    return man;
}

// Cheap test for the strat layer: does this room have metas in memory?
// Reads raw Memory so it never allocates a manager or a memory stub.
export function hasMetas(roomName: string): boolean {
    const mem = Memory.rooms[roomName]?.meta;
    return !!(mem && mem.metas.length);
}

class RoomMetaExtra extends Room {
    get meta(): MetaManager {
        return getMetaManager(this.name);
    }
}
merge(Room, RoomMetaExtra);

enum MAXHITS {
    Unknown = 0,
    Skip = 1,
    Full = 2,
    Low = 3,
    Mid = 4,
    Scale = 1000,
}

const FullHits = {
    [STRUCTURE_CONTAINER]: CONTAINER_HITS,
    [STRUCTURE_EXTENSION]: EXTENSION_HITS,
    [STRUCTURE_EXTRACTOR]: EXTRACTOR_HITS,
    [STRUCTURE_FACTORY]: FACTORY_HITS,
    [STRUCTURE_LINK]: LINK_HITS,
    [STRUCTURE_NUKER]: NUKER_HITS,
    [STRUCTURE_OBSERVER]: OBSERVER_HITS,
    [STRUCTURE_POWER_SPAWN]: POWER_SPAWN_HITS,
    [STRUCTURE_RAMPART]: RAMPART_HITS,
    [STRUCTURE_ROAD]: ROAD_HITS,
    [STRUCTURE_SPAWN]: SPAWN_HITS,
    [STRUCTURE_STORAGE]: STORAGE_HITS,
    [STRUCTURE_TERMINAL]: TERMINAL_HITS,
    [STRUCTURE_TOWER]: TOWER_HITS,
    [STRUCTURE_WALL]: WALL_HITS,
    [STRUCTURE_LAB]: LAB_HITS,
}

function calcFullHits(stype: BuildableStructureConstant): number {
    return FullHits[stype] || 1000;
}

function translateMaxHits(stype: BuildableStructureConstant, hits: MAXHITS): number {
    switch (hits) {
        case MAXHITS.Unknown:
        case MAXHITS.Skip:
            return 0;
        case MAXHITS.Full:
            return calcFullHits(stype);
        case MAXHITS.Low:
            return 100;
        case MAXHITS.Mid:
            return MAXHITS.Scale;
    }
    return hits*MAXHITS.Scale;
}


class MetaPlan extends FlagExtra {
    runMeta() {
        if (!this.parentName) {
            if (!this.dupe()) return;
        }

        switch (this.role) {
            case 'genesis': return runGenesis(this);
        }

        // const room = this.room!;

        // let meta = room.meta.getMeta(this.self);
        // if (!meta) {
        //     meta = planMeta(this);
        // } else if (!meta.check(this)) {
        //     this.log("meta check failed");
        //     meta = planMeta(this);
        // }
        // if (!meta) return;
        // room.meta.setMeta(meta);
        // //meta.draw(room.visual);
    }
}
merge(Flag, MetaPlan)


// Grey, create child flags
// White, remove child flags
// Brown, delete brown metas
// Yellow, acquire all child flags
// Green, save all changed metas to room manager
// Blue, force replanning for all metas (and the traffic).
// Traffic is not a child: the manager replans it after any saved change
// (MetaManager.updateTraffic). A traffic_<genesis> child flag only asks for
// the plan to be drawn every tick; every non-cyan pass draws it too.
export function runGenesis(f: FlagExtra) {
    //man.save();
    const newer = f.memory.newer = f.memory.newer || {};
    const room = f.room;
    if (!room) return;
    room.meta.memory.name = f.name;
    room.meta.checkTrafficOrigin();
    if (f.secondaryColor === COLOR_GREY) {
        let created = false;
        for (const meta of room.meta.metas) {
            const child = f.getChild(meta.name);
            if (child) continue;
            f.makeChild(meta.name, meta.pos, meta.mem.color);
            created = true;
        }
        if (!created) {
            f.setColor(f.color, COLOR_CYAN);
        }
        return;
    }
    let changed = false;
    let showTraffic = f.secondaryColor !== COLOR_CYAN;
    let i = -1;
    for (const child of room.find(FIND_FLAGS) as FlagExtra[]) {
        i++;
        if (child.parentName !== f.name) continue;
        if (f.secondaryColor === COLOR_WHITE) {
            child.remove();
            changed = true;
            continue;
        }
        if (child.role === kTrafficName) {
            if (f.secondaryColor === COLOR_BROWN && child.secondaryColor === COLOR_BROWN) {
                child.remove();
                changed = true;
                continue;
            }
            showTraffic = true;
            continue;
        }
        let nextm = null as MetaStructure | null;
        const meta = room.meta.getMeta(child.self);
        f.log("actual child", child, meta);
        if (!meta) {
            if (f.secondaryColor === COLOR_BROWN && child.secondaryColor === COLOR_BROWN) {
                child.remove()
                changed = true;
                room.visual.line(f.pos, child.pos, { color: "brown" });
                continue;
            }
            const mem = newer[child.self];
            f.log(child, "mem:", JSON.stringify(mem));
            if (!mem) {
                if (f.secondaryColor === COLOR_YELLOW) {
                    nextm = planMeta(child);
                    f.log("Planned child", child, nextm);
                }
            }
        } else {
            if (f.secondaryColor === COLOR_BROWN && child.secondaryColor === COLOR_BROWN) {
                room.meta.deleteMeta(meta.name);
                room.visual.line(f.pos, child.pos, { color: "red" });
                changed = true;
                continue;
            }
            if (f.secondaryColor !== COLOR_BLUE && meta.check(child)) {
                delete f.memory.newer[meta.name];
            } else {
                if (!newer[meta.name]) {
                    child.log("first plan");
                    nextm = planMeta(child);
                }
            }
        }
        child.log("Does nextm exist yet", nextm);
        if (!nextm) {
            const mem = newer[child.self];
            if (mem) {
                nextm = newMeta(mem, room.meta);
                if (!nextm?.check(child)) {
                    nextm = planMeta(child);
                }
            }
        }
        if (nextm) {
            newer[child.self] = nextm.mem;
            nextm.draw(room.visual);
            // Save children
            if (f.secondaryColor === COLOR_GREEN) {
                room.visual.line(f.pos, child.pos, { color: "yellow" });
                room.meta.setMeta(nextm);
                changed = true;
            } else {
                room.visual.line(f.pos, nextm.pos, { color: "cornflowerblue" });
            }
        } else if(meta) {
            meta.draw(room.visual);
        }
    }
    if (f.secondaryColor === COLOR_BLUE) room.meta.forceTraffic();
    if (showTraffic) room.meta.drawTraffic(room.visual);
    if (changed && _.contains([COLOR_GREEN, COLOR_BROWN], f.secondaryColor)) room.meta.save();
    if (!changed && f.secondaryColor !== COLOR_CYAN) f.setColor(f.color, COLOR_CYAN);
}

export type PlanLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
// Optional level: offered at every RCL, but only by makeSite's second pass,
// after every required tile the room can build (levels 0..RCL) is placed.
export const kAllLvls = 9;
type legend = {
    [tile: string]: [PlanLevel, BuildableStructureConstant]
}

function rotate(x: number, y: number, color: ColorConstant): [number, number] {
    switch (color) {
        case COLOR_RED: return [-x, y];
        case COLOR_ORANGE: return [x, -y];
        case COLOR_BLUE: return [-y, x];
        case COLOR_YELLOW: return [y, -x];
        case COLOR_PURPLE: return [-y, -x];
    }
    return [x, y]
}

function makeTemplate(mem: MetaMem, l: legend, points: string[], tmpl: string) {
    const [x, y] = coordsFromXY(mem.xy);
    const rows = _(tmpl.split('\n'))
        .map(s => s.trim())
        .filter(s => s.length > 1)
        .value();
    const wy = rows.length;
    const wx = _.first(rows).length;
    const oy = Math.floor(wy / 2);
    const ox = Math.floor(wx / 2);
    for (let iy = 0; iy < wy; iy++) {
        const row = rows[iy];
        for (let ix = 0; ix < row.length; ix++) {
            const tile = row[ix];
            if (tile === '.') continue;
            const [tx, ty] = rotate(ix - ox, iy - oy, mem.color);
            const xy = coordsToXY(x + tx, y + ty);

            const i = parseInt(tile, 10);
            if (points[i]) {
                mem.points[points[i]] = xy;
                continue;
            }

            if (!l[tile]) {
                console.log(`BAD TEMPLATE ${tile}@${ix},${iy}`);
                continue;
            }

            const [lvl, stype] = l[tile];
            addMemStruct(mem, stype, lvl, xy);
        }
    }
}

// Retire whatever this meta plans at `xy` once the room reaches `rcl`.
export function addMemRetire(mem: MetaMem, xy: number, rcl: number) {
    if (!mem.retire) mem.retire = {};
    mem.retire[xy] = rcl;
}

export function addMemStruct(mem: MetaMem, stype: BuildableStructureConstant, lvl: PlanLevel, xy: number) {
    if (!mem.structs[stype]) {
        mem.structs[stype] = { [lvl]: [xy] };
    } else if (!mem.structs[stype]![lvl]) {
        mem.structs[stype]![lvl] = [xy];
    } else {
        mem.structs[stype]![lvl]!.push(xy);
    }
}

function addMemSpotRampart(mem: MetaMem, name: string, lvl: PlanLevel) {
    const xy = mem.points[name]
    if (xy) {
        addMemStruct(mem, STRUCTURE_RAMPART, lvl, xy);
    }
}

function addMemRamparts(mem: MetaMem, stype: BuildableStructureConstant) {
    _.forEach(mem.structs[stype]!,
        (xys, lvl) => _.forEach(xys!,
            xy => addMemStruct(mem, STRUCTURE_RAMPART, Math.max(3,+lvl!) as PlanLevel, xy)));
}

function cleanMem(mem: MetaMem) {
    _.forEach(mem.structs, lvls => _.forEach(lvls!, (xys, lvl) => lvls![lvl as PlanLevel] = _.uniq(xys!)));
}

interface ManagerMem {
    metas: MetaMem[]
    // The roads MetaManager planned for every meta's traffic(); not a meta.
    traffic?: TrafficPlanMem
    // The room's name for itself: the genesis flag's name, stamped by
    // runGenesis. New spawns are named after it (MetaManager.spawnNames).
    name?: string
    keep?: number[]
    drop?: number[]
    roadkeep?: number[]
    roaddrop?: number[]
    [STRUCTURE_RAMPART]?: Record<number, MAXHITS>
    [STRUCTURE_WALL]?: Record<number, MAXHITS>
}

declare global {
    interface RoomMemory {
        meta?: ManagerMem
    }
}

export interface MetaMem {
    name: string
    color: ColorConstant
    priority?: number
    xy: number
    points: MetaPoints
    structs: MetaStructs
    onramps?: number[]
    // Tile -> RCL from which the structure planned there is retired: no longer
    // built, repaired or drawn, and destroyed by MetaManager.retire().
    retire?: MetaRetire
    // Traffic entries stored at plan time, for metas that cannot derive them
    // (the mission-planned Meta_rroad); see MetaStructure.traffic().
    traffic?: TrafficMem[]
}

// MetaManager's traffic plan, Memory.rooms[x].meta.traffic: a MetaMem named
// "traffic" holding only roads, by level. xy is the traffic origin it was
// planned from (0 without one).
interface TrafficPlanMem extends MetaMem {
    // Hash of the inputs (MetaManager.trafficSig); "" (a forced replan)
    // matches nothing, so the next upkeep pass replans.
    sig: string
    // Game.time of the plan.
    at?: number
    // Entries whose search reached no goal (describeTraffic).
    fail?: string[]
}
type MetaRetire = {
    [xy: number]: number
}
type MetaPoints = {
    [name: string]: number
}
type MetaLevel = {
    [lvl in PlanLevel]?: number[]
}
type MetaStructs = {
    [struct in BuildableStructureConstant]?: MetaLevel
}

type blocker = Structure | ConstructionSite | null;

function metaOrder(l: MetaStructure, r: MetaStructure) {
    if (r.priority === l.priority) {
        if (l.name < r.name) {
            return -1;
        }
        if (r.name < l.name) {
            return 1;
        }
        return 0;
    }
    return r.priority - l.priority;
}

export class MetaManager {
    metas: MetaStructure[]
    // The roads planned for every meta's traffic() (memory.traffic); not one
    // of the metas. Null until a meta declares traffic.
    traffic: TrafficPlan | null = null
    // The metas may have changed since the traffic was last checked against
    // them (updateTraffic compares signatures). In memory only: a global
    // reset checks every room once.
    trafficDirty = true
    // The plan no longer matches the metas and awaits a replan: its roads are
    // not placed meanwhile (a deleted leg's tiles, a moved field's).
    trafficStale = false
    // No traffic plan before this tick (a plan ran out of CPU).
    trafficRetry = 0
    trafficDrawn = -1
    // Origin at the last checkTrafficOrigin; undefined until the first check.
    lastOrigin: number | null | undefined = undefined
    birth = 0
    begin = 0
    wallHits = 20;
    constructor(readonly name: string) {
        const metaMem = this.memory;
        if (metaMem.traffic) this.traffic = new TrafficPlan(metaMem.traffic, this);
        this.metas = _.compact(_.map(metaMem.metas, mem => newMeta(mem, this))) as MetaStructure[];
        this.metas.sort(metaOrder);
        for (const meta of this.metas) {
            if (meta.migrate()) Game.rooms[name]?.log(meta.name, "meta memory migrated");
        }
        this.save();
        this.birth = Game.time
        this.begin = 10 + _.random(50);
    }

    get room(): Room | null {
        return Game.rooms[this.name];
    }

    get memory(): ManagerMem {
        let roomMem = Memory.rooms[this.name];
        if (!roomMem) {
            roomMem = Memory.rooms[this.name] = { links: {} } as RoomMemory;
        }
        let metaMem = roomMem.meta;
        if (!metaMem) {
            return roomMem.meta = {
                metas: [],
            };
        }
        return metaMem;
    }

    // Any save may have moved the traffic: the next upkeep pass checks. A room
    // whose metas no longer declare any traffic drops its roads on the next
    // tick, vision or not (flushTrafficDrops), unless traffic is back by then.
    save() {
        this.clearHitsCache();
        this.memory.metas = _.map(this.metas, meta => meta.mem);
        this.trafficDirty = true;
        if (this.traffic && !this.declaresTraffic()) trafficDrops.set(this.name, Game.time);
    }

    clearHitsCache() {
        const metaMem = this.memory;
        delete metaMem.drop;
        delete metaMem.keep;
        delete metaMem.roaddrop;
        delete metaMem.roadkeep;
        delete metaMem[STRUCTURE_RAMPART];
        delete metaMem[STRUCTURE_WALL];
    }

    // Destroy one structure standing on a retired tile (MetaMem.retire), then
    // drop the maxHits cache so the retired tile stops reading as repairable.
    retire(room: Room): boolean {
        for (const meta of this.metas) {
            if (meta.retire(room)) {
                this.clearHitsCache();
                return true;
            }
        }
        return false;
    }

    run() {
        const room = Game.rooms[this.name];
        if (!room) return;

        if (Game.time < this.birth + this.begin) {
            Game.rooms[this.name].dlog("Anti-thrashing");
            //return 
        }

        if (this.updateTraffic()) return;
        if (Game.time % kRetirePace === 0 && this.retire(room)) return;

        const nsites = room.find(FIND_MY_CONSTRUCTION_SITES).length
        if (nsites > 2) {
            Game.rooms[this.name]?.dlog("Full on sites", nsites);
            return;
        }

        const towers = room.findStructs(STRUCTURE_TOWER);
        if (towers.length < 1) {
            if (this.makeSite(STRUCTURE_TOWER)) return;
        }
        const spawns = room.findStructs(STRUCTURE_SPAWN);
        if (spawns.length < 1) {
            if (this.makeSite(STRUCTURE_SPAWN)) return;
        }
        if (room.energyCapacityAvailable < 600) {
            if (this.makeSite(STRUCTURE_EXTENSION)) return;
        }
        return this.makeSite(STRUCTURE_TERMINAL) ||
            this.makeSite(STRUCTURE_TOWER) ||
            this.makeSite(STRUCTURE_SPAWN) ||
            this.makeSite(STRUCTURE_EXTENSION) ||
            this.makeSite(STRUCTURE_STORAGE) ||
            this.makeSite(STRUCTURE_WALL) ||
            this.makeSite(STRUCTURE_LINK) ||
            this.makeSite(STRUCTURE_CONTAINER) ||
            this.makeSite(STRUCTURE_EXTRACTOR) ||
            this.makeSite(STRUCTURE_LAB) ||
            this.makeSite(STRUCTURE_OBSERVER) ||
            this.makeSite(STRUCTURE_NUKER) ||
            this.makeSite(STRUCTURE_POWER_SPAWN) ||
            this.makeSite(STRUCTURE_FACTORY) ||
            this.makeSite(STRUCTURE_RAMPART) ||
            (!this.trafficStale && this.makeSite(STRUCTURE_ROAD)) ||
            false
            ;
    }

    // Upkeep for rooms we do not own (ActiveStrat): only the structures that
    // need no RCL there. Same two-site gate as run().
    runUnowned(): boolean {
        const room = this.room;
        if (!room) return false;
        if (this.updateTraffic()) return true;
        if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 2) return false;
        return this.makeSite(STRUCTURE_CONTAINER) || (!this.trafficStale && this.makeSite(STRUCTURE_ROAD));
    }

    getMeta(name: string): MetaStructure | null {
        return _.find(this.metas, meta => meta.name === name) || null;
    }

    deleteMeta(name: string) {
        _.remove(this.metas, m => m.name === name);
        this.trafficDirty = true;
    }

    setMeta(meta: MetaStructure) {
        _.remove(this.metas, m => m.name === meta.name);
        this.trafficDirty = true;
        this.metas.push(meta);
        this.metas.sort(metaOrder);
    }

    getSpot(name: string): RoomPosition | null {
        for (const meta of this.metas) {
            const xy = meta.getSpot(name);
            if (!xy) continue;
            return fromXY(xy, this.name);
        }
        return null;
    }

    getSite(stype: BuildableStructureConstant): RoomPosition | null {
        for (const meta of this.metas) {
            const xy = meta.getSite(stype);
            if (xy === null) continue;
            return fromXY(xy, this.name);
        }
        return null;
    }

    getSites(stype: BuildableStructureConstant): RoomPosition[] {
        let sites = [];
        for (const meta of this.metas) {
            const ps = meta.getSites(stype).map(xy => fromXY(xy, this.name));
            sites.push(...ps);
        }
        return sites;
    }

    // The metas and the traffic plan, in metaOrder (the plan sorts at
    // priority 0 under its name): what upkeep, purge, maxHits and getMatrix walk.
    planned(): MetaStructure[] {
        if (!this.traffic) return this.metas;
        return this.metas.concat(this.traffic).sort(metaOrder);
    }

    // Planned structures and standing spots block, planned roads are cheap;
    // the traffic plan's roads count unless "traffic" is excluded.
    getMatrix(exclude: string[] = []) {
        const cm = new PathFinder.CostMatrix();
        for (const meta of this.planned()) {
            if (_.contains(exclude, meta.name)) continue;
            meta.fillMatrix(cm);
        }
        return cm;
    }

    path(cm: CostMatrix, from: RoomPosition, goals: Goal[]) {
        return PathFinder.search(from, goals,
            {
                roomCallback: roomName => {
                    if (roomName !== this.name) return false;
                    return cm;
                },
                plainCost: kPathPlain,
                swampCost: kPathSwamp,
                heuristicWeight: kPathRoad,
            });
    }

    // ---- Traffic: the roads connecting what the metas declare (traffic()),
    // planned for all of them together so they coalesce (metatraffic.ts).

    // Where the base metas' roads start: the planned storage, else the genesis
    // flag standing in for it (storageOrParent, resolved at traffic time).
    trafficOrigin(): number | null {
        const store = this.getSite(STRUCTURE_STORAGE);
        if (store) return toXY(store);
        const flag = this.memory.name ? Game.flags[this.memory.name] : undefined;
        return flag && flag.pos.roomName === this.name ? toXY(flag.pos) : null;
    }

    // Does any meta declare traffic, whether or not its src resolves?
    declaresTraffic(): boolean {
        return _.any(this.metas, m => m.traffic().length > 0);
    }

    // Every traffic entry the metas declare, metas in order, with a kOrigin
    // src resolved to trafficOrigin(); entries from a missing origin are left
    // out.
    getTraffic(): TrafficMem[] {
        const out: TrafficMem[] = [];
        const origin = this.trafficOrigin();
        for (const meta of this.metas) {
            for (const decl of meta.traffic()) {
                if (decl && decl.src === kOrigin && origin === null) continue;
                const e = decl && decl.src === kOrigin ? { ...decl, src: origin! } : decl;
                if (validTraffic(e)) out.push(e);
                else Game.rooms[this.name]?.log(meta.name, "bad traffic entry", JSON.stringify(decl));
            }
        }
        return out;
    }

    // Everything a plan is made from: the entries (their ends resolved) and
    // every meta's structures and spots, which the paths route around. Any
    // change to a meta changes it.
    trafficSig(entries: TrafficMem[]): string {
        const metas = this.metas.map(m => [m.name, m.priority, m.mem.xy, m.mem.color, m.mem.structs, m.mem.points]);
        // The origin is an input of its own: the matrix keeps roads off its
        // tile even when no entry starts there.
        return hashString(JSON.stringify([kTrafficVersion, this.trafficOrigin(), entries, metas]));
    }

    // Replan the traffic once the metas changed (trafficSig no longer matches
    // the plan's; a forced plan's is ""). Needs vision and
    // bucket. Paced unless `now` (console): one room per tick, not in the
    // manager's first ticks (begin), not within kTrafficRetry ticks of a plan
    // that ran out of CPU. True when it planned this tick, so the caller
    // leaves site placement for the next. Also drops the plans of rooms left
    // without traffic (flushTrafficDrops), since every owned room calls this
    // every tick.
    updateTraffic(now = false): boolean {
        flushTrafficDrops();
        const room = this.room;
        if (!room) return false;
        // A dirty room is hashed once, ahead of the pacing and bucket gates,
        // so a plan the metas have moved past is known stale (and its roads
        // are not placed, see run()) even while the replan itself must wait.
        if (this.trafficDirty) {
            this.trafficDirty = false;
            this.trafficStale = this.traffic?.mem.sig !== this.trafficSig(this.getTraffic());
        }
        if (!now && !this.trafficStale) return false;
        if (Game.cpu.bucket < kTrafficBucket + kTrafficHeadroom) return false;
        if (!now && (Game.time < this.birth + this.begin || Game.time < this.trafficRetry || trafficTick === Game.time)) return false;
        const entries = this.getTraffic();
        const sig = this.trafficSig(entries);
        if (!entries.length) {
            this.dropTraffic();
            this.trafficStale = false;
            return false;
        }
        trafficTick = Game.time;
        const start = Game.cpu.getUsed();
        const previous = this.traffic ? this.traffic.getSites(STRUCTURE_ROAD) : [];
        const cm = trafficMatrix(this.name, this.getMatrix([kTrafficName]), previous);
        // With no storage planned the genesis flag stands where it will go:
        // keep roads off that tile as the storage will.
        const origin = this.trafficOrigin();
        if (origin !== null && !this.getSite(STRUCTURE_STORAGE)) {
            const [ox, oy] = coordsFromXY(origin);
            cm.set(ox, oy, 0xFF);
        }
        const result = planTraffic(this.name, cm, this.ringTiles(), entries, !room.controller?.my);
        if (!result) {
            this.trafficRetry = Game.time + kTrafficRetry;
            room.log("traffic plan ran out of CPU; next try at", this.trafficRetry);
            return true;
        }
        const removed = this.commitTraffic(result, sig, previous);
        this.trafficStale = false;
        room.log("traffic planned:", entries.length, "entries,", result.roads.size, "roads,",
            removed, "dropped sites removed,", result.fail.length, "failed,",
            (Game.cpu.getUsed() - start).toFixed(1), "cpu");
        for (const e of result.fail) room.log("traffic entry reached no goal", describeTraffic(e));
        return true;
    }

    // Console: replan now (bucket and vision permitting), whatever the signature.
    replanTraffic(): boolean {
        return this.updateTraffic(true);
    }

    // Replan on the next upkeep pass whatever the signature (BLUE): the plan's
    // signature is cleared in memory, so a global reset does not lose it.
    // Memory is re-parsed every tick, so the plan's runtime mem (what
    // updateTraffic compares) and the live Memory object are both written.
    forceTraffic() {
        if (this.traffic) this.traffic.mem.sig = "";
        const live = this.memory.traffic;
        if (live) live.sig = "";
        this.trafficDirty = true;
    }

    // The genesis flag stands in for the storage until one is planned; a
    // moved flag moves the roads without any meta being saved. Compared with
    // the origin last seen (not the plan's, which stays put while the
    // signature judges the move unchanged), so each move dirties once.
    checkTrafficOrigin() {
        const origin = this.trafficOrigin();
        if (origin === this.lastOrigin) return;
        this.lastOrigin = origin;
        this.trafficDirty = true;
    }

    // Planned storage, terminal and spawns: planTraffic rings each with roads.
    ringTiles(): number[] {
        const out: number[] = [];
        for (const stype of kRingTypes) {
            for (const p of this.getSites(stype)) out.push(toXY(p));
        }
        return out;
    }

    // Store a new plan and remove our road sites on the tiles it dropped.
    // Dropped built roads are left to decay (maxHits no longer keeps them).
    // Returns the number of sites removed.
    commitTraffic(result: TrafficResult, sig: string, previous: number[]): number {
        const mem = newTrafficMem(this.trafficOrigin() || 0);
        mem.sig = sig;
        mem.at = Game.time;
        for (const [xy, lvl] of result.roads) addMemStruct(mem, STRUCTURE_ROAD, lvl as PlanLevel, xy);
        if (result.fail.length) mem.fail = result.fail.map(describeTraffic);
        this.memory.traffic = mem;
        this.traffic = new TrafficPlan(mem, this);
        this.clearHitsCache();
        return this.removeRoadSites(previous.filter(xy => !result.roads.has(xy)));
    }

    // No traffic left: forget the plan and remove its sites; its built roads
    // decay.
    dropTraffic() {
        const plan = this.traffic;
        if (!plan) return;
        const removed = this.removeRoadSites(plan.getSites(STRUCTURE_ROAD));
        delete this.memory.traffic;
        this.traffic = null;
        this.clearHitsCache();
        debug.log(this.name, "traffic plan dropped: no traffic entries left;", removed, "road sites removed");
    }

    // Remove our road sites on `xys`, except where a meta still plans a road.
    // Walks Game.constructionSites, which holds our sites in rooms we cannot
    // see too, and remove() needs no vision.
    removeRoadSites(xys: number[]): number {
        const drop = new Set(xys.filter(xy => !_.any(this.metas, m => m.hasAny(STRUCTURE_ROAD, xy))));
        if (!drop.size) return 0;
        let n = 0;
        for (const id in Game.constructionSites) {
            const site = Game.constructionSites[id];
            if (site.structureType !== STRUCTURE_ROAD || site.pos.roomName !== this.name) continue;
            if (drop.has(toXY(site.pos)) && site.remove() === OK) n++;
        }
        return n;
    }

    // Draw the plan's roads not built yet, at most once a tick however many
    // callers (genesis flag, missions) ask.
    drawTraffic(v?: RoomVisual) {
        if (!this.traffic || this.trafficDrawn === Game.time) return;
        this.trafficDrawn = Game.time;
        this.traffic.draw(v || new RoomVisual(this.name));
    }

    // Console: one line on the plan.
    trafficStatus(): string {
        const entries = this.getTraffic();
        const mem = this.memory.traffic;
        if (!mem) return `${this.name} traffic: no plan, ${entries.length} entries`;
        const roads: MetaLevel = mem.structs[STRUCTURE_ROAD] || {};
        const lvls = _.map(roads, (xys: number[], lvl: string) => `${lvl}:${xys.length}`).join(" ");
        const stale = mem.sig !== this.trafficSig(entries) ? " STALE" : "";
        const at = mem.at === undefined ? "never" : `${Game.time - mem.at} ticks ago`;
        const fail = mem.fail ? ` fail: ${mem.fail.join(" ")}` : "";
        return `${this.name} traffic: ${entries.length} entries, roads by level ${lvls || "none"}, planned ${at}${stale}${fail}`;
    }

    // The names offered to a new spawn, from the room's meta name (the
    // genesis flag's name): "Noon", "Nooner", "Noonest". Empty before a
    // genesis pass has stamped the name.
    spawnNames(): string[] {
        const base = this.memory.name;
        if (!base) return [];
        return [base, base + "er", base + "est"];
    }

    // createConstructionSite that names a spawn after the room when it can.
    // Each name in spawnNames() is tried in turn (a name already used by a
    // spawn or spawn site anywhere is ERR_INVALID_ARGS); with all of them
    // taken the game picks its own name.
    createSite(pos: RoomPosition, stype: BuildableStructureConstant): ScreepsReturnCode {
        if (stype === STRUCTURE_SPAWN) {
            for (const name of this.spawnNames()) {
                if (Game.spawns[name]) continue;
                const ret = pos.createConstructionSite(stype, name);
                if (ret !== ERR_INVALID_ARGS) return ret;
            }
        }
        return pos.createConstructionSite(stype);
    }

    // While armed hostiles (not Source Keepers, which never leave) are in the
    // room only defences get sites: a site elsewhere would be trampled or
    // draw builders into the fight.
    hostileHold(room: Room, stype: BuildableStructureConstant): boolean {
        if (stype === STRUCTURE_RAMPART || stype === STRUCTURE_TOWER) return false;
        return _.any(room.hostiles, h => !h.keeper);
    }

    makeSite(stype: BuildableStructureConstant): boolean {
        const room = Game.rooms[this.name];
        if (!room) return false;
        if (this.hostileHold(room, stype)) return false;
        const planned = this.planned();
        let blocker: blocker = null;
        for (const meta of planned) {
            const [free, newblocker] = meta.findSite(stype, room);
            if (free) {
                const ret = this.createSite(free, stype);
                if (ret === OK) return true;
                // Never purge in a room we do not own: the RCL error there
                // means the room is someone else's, not that we are over a limit.
                if (ret === ERR_RCL_NOT_ENOUGH) return roomLevel(room) ? this.purgeOptional(stype) : false;
                room.errlog(ret, "Failed  to create site", stype, free.xy, "blocker", newblocker);
            }
            if (!blocker && newblocker) {
                room.log(`found blocker of ${stype} in ${meta.name} at ${newblocker}`);
                blocker = newblocker;
            }
        }

        if (blocker) {
            room.log("SITE BLOCKED!", stype, blocker);
            return this.removeDestroy(blocker);
        }

        blocker = null;
        for (const meta of planned) {
            const [free, newblocker] = meta.findOptional(stype, room);
            if (free) {
                const ret = this.createSite(free, stype);
                if (ret === OK) return true;
                if (ret === ERR_RCL_NOT_ENOUGH) return roomLevel(room) ? this.purge(stype) : false;
                room.errlog(ret, "Failed to create site", stype);
            }
            if (!blocker) {
                blocker = newblocker;
            }
        }
        if (blocker) {
            room.log("OPTIONAL SITE BLOCKED", stype, blocker);
            return this.removeDestroy(blocker);
        }

        return false;
    }

    purgeOptional(stype: BuildableStructureConstant): boolean {
        if (this.purge(stype)) {
            return true;
        }
        const room = Game.rooms[this.name];
        room.log("purging optional", stype);
        const metas = this.metas.slice().reverse();
        for (const meta of metas) {
            const lvls = meta.mem.structs[stype];
            if (!lvls) continue;
            const xys = lvls[kAllLvls];
            if (!xys) continue;
            for (const xy of xys) {
                const [x, y] = coordsFromXY(xy);
                const found = room.lookForAt(LOOK_STRUCTURES, x, y);
                for (const struct of found) {
                    if (struct.structureType === stype) {
                        return this.removeDestroy(struct);
                    }
                }
            }
        }
        return false;
    }

    purge(stype: BuildableStructureConstant): boolean {
        const room = Game.rooms[this.name];
        const rcl = room.controller && room.controller.level || 0;
        room.log("purging", stype);
        const structs = room.findStructs(stype);
        const planned = this.planned();
        for (const struct of structs) {
            const m = _.find(planned, m => m.has(stype, rcl, struct.pos.xy));
            if (!m) {
                return this.removeDestroy(struct);
            }
        }
        return false;
    }

    removeDestroy(s: Structure | ConstructionSite) {
        s.room?.visual.line(25, 25, s.pos.x, s.pos.y, { color: "red" });
        if (s instanceof ConstructionSite) {
            const err = s.remove();
            s.room?.errlog(err as ScreepsReturnCode, "failed to remove site:", s);
            return err === OK;
        }

        const special = [
            STRUCTURE_STORAGE,
            STRUCTURE_TERMINAL,
            STRUCTURE_FACTORY,
        ];

        if (_.contains(special, s.structureType)) {
            const ctors = s.room.find(FIND_MY_CONSTRUCTION_SITES);
            for (const ctor of ctors) {
                if (_.contains(special, ctor.structureType)) {

                    s.room.visual.line(s.pos.x, s.pos.y, ctor.pos.x, ctor.pos.y, { color: "yellow" });
                    s.room.log(`Protected purge of ${s} by ${ctor}`);
                    return false;
                }
            }
        }
        const err = s.destroy();
        s.room?.errlog(err, "failed to destory site:", s);
        return err === OK;
    }

    spawnEnergy(): SpawnEnergy[] {
        const room = Game.rooms[this.name];
        if (!room) return [];

        // Shuffle hi priority extns to balance energy drain among peers.
        const seFirst = [];
        let priority = Infinity;
        let toShuffle = [];
        for (const meta of this.metas) {
            if (meta.priority !== priority) {
                seFirst.push(..._.shuffle(toShuffle));
                priority = meta.priority;
                toShuffle = [];
            }
            toShuffle.push(...meta.spawnEnergyFirst());
        }
        seFirst.push(..._.shuffle(toShuffle));

        const seLast = [];
        for (const meta of this.metas) {
            seLast.push(...meta.spawnEnergyLast());
        }

        const rest = [];// as SpawnEnergy[];
        for (const se of room.findStructs(STRUCTURE_SPAWN, STRUCTURE_EXTENSION) as SpawnEnergy[]) {
            if (_.any(seFirst, first => se.id === first.id)) continue;
            if (_.any(seLast, last => se.id === last.id)) continue;
            rest.push(se);
        }
        const store = room.storage || room.terminal;
        if (store) {
            rest.sort((l, r) => l.pos.getRangeTo(store) - r.pos.getRangeTo(store));
        }

        const seFullFirst = _.remove(seFirst, se => !se.store.getFreeCapacity(RESOURCE_ENERGY));

        return seFullFirst.concat(seFirst).concat(rest).concat(seLast);
    }

    maxHits(stype: BuildableStructureConstant, xy: number, rcl: number): number {
        const mh = this.cachedMaxHits(stype, xy);
        if(mh !== MAXHITS.Unknown) return translateMaxHits(stype, mh);

        const newmh = this.maxHitsInner(stype, xy, rcl);
        this.addMaxHits(stype, xy, newmh);

        return translateMaxHits(stype, newmh);
    }

    cachedMaxHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        if (stype === STRUCTURE_ROAD) {
            if (_.contains(this.memory.roadkeep!, xy)) return MAXHITS.Full;
            if (_.contains(this.memory.roaddrop!, xy)) return MAXHITS.Skip;
            return MAXHITS.Unknown;
        }
        if (stype === STRUCTURE_WALL || stype === STRUCTURE_RAMPART) {
            const cache = this.memory[stype];
            if (cache) {
                return cache[xy] || MAXHITS.Unknown
            }
            return MAXHITS.Unknown
        }
        if (_.contains(this.memory.keep!, xy)) return MAXHITS.Full;
        if (_.contains(this.memory.drop!, xy)) return MAXHITS.Skip;
        return MAXHITS.Unknown;
    }

    addMaxHits(stype: BuildableStructureConstant, xy: number, hits: MAXHITS) {
        if (stype === STRUCTURE_ROAD) {
            if (hits === MAXHITS.Skip || hits === MAXHITS.Unknown) {
                if (!this.memory.roaddrop) {
                    this.memory.roaddrop = [xy];
                } else {
                    this.memory.roaddrop.push(xy);
                }
            } else {
                if (!this.memory.roadkeep) {
                    this.memory.roadkeep = [xy];
                } else {
                    this.memory.roadkeep.push(xy);
                }
            }
            return;
        }

        if (stype === STRUCTURE_WALL || stype === STRUCTURE_RAMPART) {
            let cache = this.memory[stype];
            if (!cache) {
                cache = this.memory[stype] = Object.create(null);
            }
            cache![xy] = hits || MAXHITS.Skip;
            return;
        }

        if (hits === MAXHITS.Skip || hits === MAXHITS.Unknown) {
            if (!this.memory.drop) {
                this.memory.drop = [xy];
            } else {
                this.memory.drop.push(xy);
            }
        } else {
            if (!this.memory.keep) {
                this.memory.keep = [xy];
            } else {
                this.memory.keep.push(xy);
            }
        }
    }

    maxHitsInner(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        for (const meta of this.planned()) {
            const mh = meta.maxHits(stype, xy, rcl);
            if (mh > MAXHITS.Unknown) return mh;
        }
        return MAXHITS.Unknown;
    }

    getLinkMode(xy: number): Mode {
        for (const meta of this.metas) {
            const mode = meta.getLinkMode(xy);
            if (mode !== Mode.pause) {
                this.room?.log(meta.name, "setting mode", xy, mode);
                return mode;
            }
        }
        return Mode.pause;
    }
}

export function roomLevel(room: Room): PlanLevel {
    if (!room.controller) return 0;
    if (!room.controller.my) return 0;
    return room.controller.level as PlanLevel;
}

export class MetaStructure {
    pos: RoomPosition
    constructor(public mem: MetaMem, readonly manager: MetaManager) {
        const [x, y] = coordsFromXY(mem.xy);
        this.pos = new RoomPosition(x, y, manager.name);
    }

    static makeMem(f: Flag): MetaMem {
        return {
            name: f.self,
            xy: toXY(f.pos),
            color: f.secondaryColor,
            structs: {},
            points: {},
        };
    }

    check(f: Flag): boolean {
        const xy = toXY(f.pos);
        return f.self === this.mem.name && this.mem.xy === xy && f.secondaryColor === this.mem.color;
    }

    get priority(): number {
        return this.mem.priority || 0;
    }

    get name(): string {
        return this.mem.name;
    }

    get role(): string {
        return calcRole(this.name);
    }

    get room(): Room | null {
        return Game.rooms[this.manager.name] || null;
    }

    targetid<S extends AnyStructure>(): Id<S> {
        return "" as Id<S>;
    }

    getSpot(name: string): number {
        const xy = this.mem.points[name];
        if (!xy) return 0;
        return xy;
    }

    get myspot(): number {
        return this.getSpot(calcRole(this.name));
    }

    set myspot(xy: number) {
        this.mem.points[calcRole(this.name)] = xy;
    }

    // The roads this meta wants: pairs of tiles in its room (TrafficMem) that
    // the manager connects, planning every meta's together so they coalesce.
    // By default the entries stored at plan time (mission metas); base metas
    // build theirs from mem, starting at kOrigin, so a moved storage moves them.
    traffic(): TrafficMem[] {
        return this.mem.traffic || [];
    }

    // A road from the room's traffic origin (kOrigin: the storage, else the
    // genesis flag, resolved when the traffic is planned) to within `range`
    // of `dest`; none without a dest.
    originTraffic(dest: number | null, range: number, rcl = kTrafficLevel): TrafficMem[] {
        if (!dest) return [];
        return [{ src: kOrigin, dest, range, rcl, swamp: rcl }];
    }

    // Is the tile's planned structure retired at this RCL?
    isRetired(xy: number, rcl: number): boolean {
        const at = this.mem.retire?.[xy];
        return at !== undefined && rcl >= at;
    }

    // One-shot memory upgrade when the manager loads; return true if mem changed.
    migrate(): boolean {
        return false;
    }

    // Clear one retired tile: remove a planned site, or destroy a planned
    // structure that would not decay on its own. Roads, containers and
    // ramparts are left to decay once nothing repairs them (calcStructHits
    // answers Unknown for a retired tile); ramparts are also planned over
    // other structures. purge() keeps its own, older rules.
    retire(room: Room): boolean {
        const rcl = Number(roomLevel(room));
        for (const key in this.mem.retire) {
            const xy = parseInt(key, 10);
            if (!this.isRetired(xy, rcl)) continue;
            const [x, y] = coordsFromXY(xy);
            const found: (Structure | ConstructionSite)[] = [
                ...room.lookForAt(LOOK_STRUCTURES, x, y),
                ...room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y),
            ];
            for (const st of found) {
                if (!this.hasAny(st.structureType as BuildableStructureConstant, xy)) continue;
                if (!(st instanceof ConstructionSite) && _.contains(kDecays, st.structureType)) continue;
                room.log(this.name, "retiring", st.structureType, "at", x, y);
                return this.manager.removeDestroy(st);
            }
        }
        return false;
    }

    // Does this meta manage a an stype at up to maxLvl
    has(stype: BuildableStructureConstant, maxLvl: number, xy: number): boolean {
        if (this.isRetired(xy, maxLvl)) return false;
        const lvls = this.mem.structs[stype];
        if (!lvls) return false;
        const optxys = lvls[kAllLvls];
        if (optxys && _.any(optxys, optxy => optxy === xy)) return true;
        for (let lvl = 1; lvl <= maxLvl; lvl++) {
            if (_.any(lvls[lvl as 1]!, lxy => lxy === xy)) return true;
        }
        return false;
    }

    // Does this meta managea an stype at one level
    hasAt(stype: BuildableStructureConstant, lvl: number, xy: number): boolean {
        const lvls = this.mem.structs[stype];
        if (!lvls) return false;
        return _.contains(lvls[lvl as 1]!, xy);
    }

    // Does this meta manage an stype at any level
    hasAny(stype: BuildableStructureConstant, xy: number): boolean {
        //console.log(this.name, "has any checking", stype, xy);
        return _.any(this.mem.structs[stype]!, xys => _.contains(xys!, xy));
    }

    getSite(stype: BuildableStructureConstant): number | null {
        const lvls = this.mem.structs[stype];
        if (!lvls) return null;
        return _.first(_.find(lvls!, () => true)!);
    }

    getSites(stype: BuildableStructureConstant): number[] {
        const lvls = this.mem.structs[stype];
        if (!lvls) return [];
        return _.flatten(_.values(lvls));
    }

    fillMatrix(cm: CostMatrix) {
        _.forEach(this.mem.points, xy => {
            const [x, y] = coordsFromXY(xy);
            cm.set(x, y, 0xFE);
        });
        _.forEach(this.mem.structs, (lvls, stype) =>
            _.forEach(lvls!, xys =>
                _.forEach(xys!, xy => {
                    const [x, y] = coordsFromXY(xy);
                    if (stype === STRUCTURE_ROAD) {
                        // Never cheapen a tile another meta (filled earlier)
                        // blocks: a road planned over its extension is that
                        // plan's error, not a way through.
                        if (cm.get(x, y) < 0xFE) cm.set(x, y, kPlannedRoad);
                        return;
                    }

                    if (stype !== STRUCTURE_RAMPART) {
                        cm.set(x, y, 0xFF);
                    }
                })
            )
        );
    }

    findSite(stype: BuildableStructureConstant, room: Room): [RoomPosition | null, Structure | ConstructionSite | null] {
        const lvls = this.mem.structs[stype];
        if (!lvls) return [null, null];

        const max = roomLevel(room);
        for (let lvl = 0; lvl <= max; lvl++) {
            const [free, blocker] = this.findXys(lvls[lvl as PlanLevel], stype, room);
            if (free || blocker) {
                return [free, blocker];
            }
        }
        return [null, null];
    }

    findOptional(stype: BuildableStructureConstant, room: Room): [RoomPosition | null, Structure | ConstructionSite | null] {
        const lvls = this.mem.structs[stype];
        if (!lvls) return [null, null];
        return this.findXys(lvls[kAllLvls], stype, room);
    }

    findXys(xys: undefined | number[], stype: BuildableStructureConstant, room: Room): [RoomPosition | null, Structure | ConstructionSite | null] {
        if (!xys) return [null, null];
        let blocker: Structure | ConstructionSite | null = null;
        const rcl = Number(roomLevel(room));
        for (const xy of xys!) {
            if (this.isRetired(xy, rcl)) continue;
            const p = fromXY(xy, room.name);
            const [free, newblocker] = checkSitePos(p, stype);
            if (free) {
                return [free, blocker];
            }
            if (!blocker || Math.random() > 0.5) {
                blocker = newblocker;
            }
        }
        return [null, blocker];
    }

    draw(v: RoomVisual) {
        // Without vision lookFor throws; draw every planned structure instead.
        const room = Game.rooms[v.roomName];
        _.forEach(this.mem.structs, (lvls, stype) =>
            _.forEach(lvls!, xys =>
                xys!.forEach(xy => {
                    if (room && this.isRetired(xy, Number(roomLevel(room)))) return
                    const [x, y] = coordsFromXY(xy);
                    if (room && _.any(room.lookForAt(LOOK_STRUCTURES, x, y), s => s.structureType === stype)) return
                    v.structure(x, y, stype as StructureConstant, { opacity: 0.5 });
                })
            )
        );
        _.forEach(this.mem.points, xy => {
            const [x, y] = coordsFromXY(xy);
            v.animatedPosition(x, y);
        });
    }

    spawnEnergyFirst(): SpawnEnergy[] {
        return []
    }

    spawnEnergyLast(): SpawnEnergy[] {
        return []
    }


    // getStructs(stype: STRUCTURE_EXTENSION): StructureExtension[];
    // getStructs(stype: STRUCTURE_SPAWN): StructureSpawn[];
    // getStructs(stype: BuildableStructureConstant): AnyStructure[] {
    getStructs<STYPE extends BuildableStructureConstant>(stype: STYPE): AllStructureTypes[STYPE][];
    getStructs(stype: BuildableStructureConstant): AnyStructure[] {
        const room = this.room;
        if (!room) return [];
        const lvls = this.mem.structs[stype];
        if (!lvls) return [];
        const ret = [] as AnyStructure[];
        _.forEach(lvls, xys => {
            for (const xy of xys!) {
                const [x, y] = coordsFromXY(xy);
                const structs = room.lookForAt(LOOK_STRUCTURES, x, y);
                for (const struct of structs) {
                    if (isSType(struct, stype)) {
                        ret.push(struct)
                    }
                }
            }
        });
        return ret;
    }

    getSpawnEnergies(): SpawnEnergy[] {
        const extns = this.getStructs(STRUCTURE_EXTENSION) as SpawnEnergy[];
        return extns.concat(this.getStructs(STRUCTURE_SPAWN));
    }

    maxHits(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        return this.calcStructHits(stype, xy, rcl);
    }

    calcRclHits(rcl:number): MAXHITS {
        switch(rcl) {
            case 1: return MAXHITS.Skip;
            case 2: return MAXHITS.Low;
            case 3: return MAXHITS.Mid;
            case 4: return 5;
            case 5: return 1000;
            case 6: return 5000;
            case 7: return 10000;
            case 8: return 20000;
        }
        return MAXHITS.Skip;
    }

    calcRampWallHits(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        if (stype === STRUCTURE_RAMPART && this.hasAny(STRUCTURE_RAMPART, xy)) return this.calcRclHits(rcl);
        if (stype === STRUCTURE_WALL && this.hasAny(STRUCTURE_WALL, xy)) return this.calcRclHits(rcl);
        return MAXHITS.Unknown;
    }

    calcRampBldgHits(stypes: BuildableStructureConstant[], xy: number, rcl: number): MAXHITS {
        for (const stype of stypes) {
            if (this.hasAny(stype, xy)) return this.calcRclHits(rcl);
        }
        return MAXHITS.Unknown;
    }

    calcStructHits(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        if (stype === STRUCTURE_RAMPART || stype === STRUCTURE_WALL) return MAXHITS.Unknown;
        if (this.isRetired(xy, rcl)) return MAXHITS.Unknown;
        if (this.hasAny(stype, xy)) return MAXHITS.Full;
        return MAXHITS.Unknown;
    }

    calcRampSpotHits(xy: number, rcl: number): MAXHITS {
        if (_.any(this.mem.points, pxy => pxy === xy)) return this.calcRclHits(rcl);
        return MAXHITS.Unknown;
    }

    getLinkMode(xy: number) {
        return Mode.pause;
    }
}

function checkSitePos(pos: RoomPosition, stype: BuildableStructureConstant): [RoomPosition | null, Structure | ConstructionSite | null] {
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    for (const site of sites) {
        if (!site.my) {
            return [null, site];
        }
        if (site.structureType === stype || site.structureType === STRUCTURE_RAMPART || stype === STRUCTURE_RAMPART) {
            return [null, null];
        }
        return [null, site];
    }

    const structs = pos.lookFor(LOOK_STRUCTURES) as Structure[];
    for (const struct of structs) {
        if (isOwnedStruct(struct) && !struct.my) {
            return [null, struct];
        }
        // it's mine and the correct type
        if (struct.structureType === stype) return [null, null];

        if (stype === STRUCTURE_RAMPART) continue;

        if (struct.structureType === STRUCTURE_RAMPART) continue;

        // Wrong structure and not a rampart
        return [null, struct];
    }
    return [pos, null];
}

export type MetaCtor = typeof MetaStructure & { plan(f: Flag, man: MetaManager): MetaStructure | null };
const allMetas = new Map<string, MetaCtor>();

export function registerMeta(klass: MetaCtor) {
    allMetas.set(klass.name, klass);
}

function planMeta(f: Flag) {
    const role = calcRole(f.name);
    const klassName = 'Meta_' + role;
    const klass = allMetas.get(klassName);
    f.log("Planning Meta", klassName, role, klass?.name);
    if (!klass) return null;
    const man = f.room!.meta;
    return klass.plan(f, man);
}

// Where asrc/bsrc and ctrl path to: the saved storage site, else the child's
// parent (genesis) flag, so a fresh room plans in one YELLOW pass with the
// genesis flag standing in for the storage. MetaManager.trafficOrigin is the
// same rule for the traffic.
function storageOrParent(f: FlagExtra, man: MetaManager): RoomPosition | null {
    const storep = man.getSite(STRUCTURE_STORAGE);
    if (storep) return storep;
    const parent = f.parent;
    if (!parent || parent.pos.roomName !== man.name) return null;
    f.log("no storage meta, planning toward", parent);
    return parent.pos;
}

function newMeta(mem: MetaMem, man: MetaManager) {
    const role = calcRole(mem.name);
    const klassName = 'Meta_' + role;
    const klass = allMetas.get(klassName);
    if (!klass) return null;
    return new klass(mem, man);
}

@registerMeta
class Meta_hub extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const legend: legend = {
            s: [1, STRUCTURE_SPAWN],
            a: [3, STRUCTURE_TOWER],
            r: [3, STRUCTURE_ROAD],
            S: [4, STRUCTURE_STORAGE],
            b: [5, STRUCTURE_TOWER],
            l: [5, STRUCTURE_LINK],
            T: [6, STRUCTURE_TERMINAL],
            c: [7, STRUCTURE_TOWER],
            f: [7, STRUCTURE_FACTORY],
            p: [8, STRUCTURE_POWER_SPAWN],
        }
        const layout = `
            albr
            S0sr
            r1Tr
            fcp.`;
        // const layout = `
        //     rSsd.
        //     a0l1d
        //     bcTdp`;
        const points = ['hub', 'shovel'];
        const mem = MetaStructure.makeMem(f);
        // after asrc before cap
        mem.priority = 102;
        makeTemplate(mem, legend, points, layout);
        addMemRamparts(mem, STRUCTURE_FACTORY);
        addMemRamparts(mem, STRUCTURE_POWER_SPAWN);
        addMemRamparts(mem, STRUCTURE_SPAWN);
        addMemRamparts(mem, STRUCTURE_STORAGE);
        addMemRamparts(mem, STRUCTURE_TERMINAL);
        addMemRamparts(mem, STRUCTURE_TOWER);
        addMemSpotRampart(mem, 'hub', 3);
        addMemSpotRampart(mem, 'shovel', 6);
        return new this(mem, man);
    }

    // The storage is the traffic origin; this connects the terminal to it.
    // The rings (planTraffic) wrap both.
    traffic(): TrafficMem[] {
        return this.originTraffic(this.getSite(STRUCTURE_TERMINAL), 1);
    }

    spawnEnergyFirst() {
        return this.getSpawnEnergies();
    }

    maxHits(stype: BuildableStructureConstant, xy: number, rcl:number): MAXHITS {
        const ramped = [
            STRUCTURE_FACTORY,
            STRUCTURE_POWER_SPAWN,
            STRUCTURE_SPAWN,
            STRUCTURE_STORAGE,
            STRUCTURE_TERMINAL,
            STRUCTURE_TOWER,
        ];
        return this.calcStructHits(stype, xy, rcl) ||
            this.calcRampBldgHits(ramped, xy, rcl) ||
            this.calcRampSpotHits(xy, rcl);
    }

    getLinkMode(xy: number) {
        if (this.hasAny(STRUCTURE_LINK, xy)) return Mode.hub;
        return Mode.pause;
    }
}

@registerMeta
class Meta_cap extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const legend: legend = {
            a: [2, STRUCTURE_EXTENSION],
            b: [3, STRUCTURE_EXTENSION],
            c: [4, STRUCTURE_EXTENSION],
            C: [3, STRUCTURE_CONTAINER],
            r: [3, STRUCTURE_ROAD],
        }
        const layout = `
            .bba.
            bbrar
            brCra
            ccraa
            .ccc.`;
        const mem = MetaStructure.makeMem(f);
        // after asrc and hub, before extns
        mem.priority = 101;
        makeTemplate(mem, legend, [], layout);
        return new this(mem, man);
    }
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 2);
    }
    spawnEnergyFirst() {
        // TODO custom ordering to maximize path.
        // Default ordering is correct in chunks of 5
        return this.getSpawnEnergies();
    }
    getLinkMode(xy: number) {
        if (this.hasAny(STRUCTURE_LINK, xy)) return Mode.sink;
        return Mode.pause;
    }
}


@registerMeta
class Meta_lab extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const legend: legend = {
            a: [6, STRUCTURE_LAB],
            b: [7, STRUCTURE_LAB],
            c: [8, STRUCTURE_LAB],
            r: [6, STRUCTURE_ROAD],
            S: [7, STRUCTURE_SPAWN],
            s: [8, STRUCTURE_SPAWN],
            o: [8, STRUCTURE_OBSERVER],
            n: [8, STRUCTURE_NUKER],
        }
        const layout = `
            bcrbr
            crarS
            rarcr
            brcan
            rsro.`;
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, [], layout);
        addMemRamparts(mem, STRUCTURE_SPAWN);
        return new this(mem, man);
    }
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 1);
    }
    spawnEnergyLast() {
        return this.getSpawnEnergies();
    }
    maxHits(stype: BuildableStructureConstant, xy: number, rcl:number): number {
        return this.calcStructHits(stype, xy, rcl) ||
            this.calcRampBldgHits([STRUCTURE_SPAWN], xy, rcl);
    }
}

class Meta_extn extends MetaStructure {
    static layout: string;
    static plan(f: Flag, man: MetaManager) {
        const legend: legend = {
            e: [kAllLvls, STRUCTURE_EXTENSION],
            r: [5, STRUCTURE_ROAD],
        };
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, [], this.layout);
        Meta_extn.orderByHub(mem, man);
        return new this(mem, man);
    }

    // findXys takes the first free tile, so the extension list's order is the
    // build order. Sort it by range to the hub spot (storage site, then the
    // meta's own anchor, when the room has no hub) so the field fills from
    // the hub outward and haulers walk less.
    static orderByHub(mem: MetaMem, man: MetaManager) {
        const hub = man.getSpot('hub') || man.getSite(STRUCTURE_STORAGE) || fromXY(mem.xy, man.name);
        const xys = mem.structs[STRUCTURE_EXTENSION]?.[kAllLvls];
        if (!xys) return;
        mem.structs[STRUCTURE_EXTENSION]![kAllLvls] = _.sortBy(xys, xy => hub.getRangeTo(fromXY(xy, man.name)));
    }

    // Fields planned before Sept 2026 were in template scan order.
    migrate(): boolean {
        const before = this.mem.structs[STRUCTURE_EXTENSION]?.[kAllLvls];
        if (!before) return false;
        Meta_extn.orderByHub(this.mem, this.manager);
        return !_.isEqual(before, this.mem.structs[STRUCTURE_EXTENSION]![kAllLvls]);
    }
}

@registerMeta
class Meta_extna extends Meta_extn {
    static layout = `
        ere
        rer
        ere`;
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 1);
    }
}

@registerMeta
class Meta_extnb extends Meta_extn {
    static layout = `
        reree
        erere
        reeer
        erere
        eerer`;
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 2);
    }
}

@registerMeta
class Meta_extnc extends Meta_extn {
    static layout = `
        eeree..
        ereree.
        reeeree
        ererere
        eereeer
        .eerere
        ..eeree`;
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 3);
    }
}

// Prefers tiles with open neighbors
// Returns weights of 10-20 so prefer scaled by number of open neighbors.
function calcWeight(x: number, y: number, t: RoomTerrain): number {
    // TODO add weight to avoid paths near Exits but allow edges to be still safe.
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (t.get(x + dx, y + dy) & TERRAIN_MASK_WALL) continue;
            count += 1;
        }
    }
    return 20 - count;
}

// Source extensions are filled by the srcer standing next to them, so they
// are the cheapest extensions to run. RCL2 puts them ahead of Meta_cap's
// RCL2 field: makeSite walks metas by priority (asrc/bsrc 103 > cap 101) but
// only over levels the room has reached.
const kSrcExtensionLevel: PlanLevel = 2;
// The source container is offered from RCL2, but findSite holds it back
// below RCL3 until a spawn stands in the room: in a room being booted the
// spawn is what the first energy must go into, not a container.
const kSrcContainerLevel: PlanLevel = 2;
const kSrcContainerFreeLevel = 3;

@registerMeta
class Meta_asrc extends MetaStructure {
    static plan(f: FlagExtra, man: MetaManager) {
        const storep = storageOrParent(f, man);
        if (!storep) return null;
        const t = Game.map.getRoomTerrain(f.pos.roomName);
        //const cm = man.getMatrix([f.self]);
        const cm = new PathFinder.CostMatrix();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = f.pos.x + dx;
                const y = f.pos.y + dy;
                if (t.get(x, y) & TERRAIN_MASK_WALL) continue;
                cm.set(x, y, cm.get(x, y) + calcWeight(x, y, t));
            }
        }

        let ret = man.path(cm, f.pos, [{ pos: storep, range: 1 }]);
        const mem = MetaStructure.makeMem(f);
        // Before extensions
        mem.priority = 103;

        // Best spot is the first step toward storage. RED picks the second
        // best, PURPLE the third, ranked by the same weighted path cost.
        const self = Meta_asrc.pickSpot(f, man, cm, t, ret.path[0], storep);
        addMemStruct(mem, STRUCTURE_CONTAINER, kSrcContainerLevel, self.xy);

        // easy travel near source, but hard were extns will be.
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = self.x + dx;
                const y = self.y + dy;
                if (f.pos.getRangeTo(x, y) <= 1) continue;
                if (t.get(x, y) & TERRAIN_MASK_WALL) continue;
                cm.set(x, y, cm.get(x, y) + 50);
            }
        }

        ret = man.path(cm, self, [{ pos: storep, range: 1 }]);
        const v = new RoomVisual(man.name);
        for (const pos of ret.path) {
            v.circle(pos.x, pos.y);
        }

        const roadp = ret.path[0];
        addMemStruct(mem, STRUCTURE_ROAD, kAllLvls, roadp.xy);

        let linkp = roadp; // this will change if there are at least 2 nearby spots (very likely).
        let linkDist = 100;

        let adj = [] as RoomPosition[];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const ep = new RoomPosition(self.x + dx, self.y + dy, self.roomName);
                if (t.get(ep.x, ep.y) & TERRAIN_MASK_WALL) continue;
                if (ep.isEqualTo(roadp)) continue;
                adj.push(ep);
                const dist = ep.getRangeTo(storep);
                f.log("possible link", ep.xy, "at", dist);
                if (dist < linkDist) {
                    linkDist = dist;
                    linkp = ep;
                }
            }
        }
        f.log("link", linkp);
        addMemStruct(mem, STRUCTURE_LINK, 5, linkp.xy);
        for (const ep of adj) {
            if (ep.isEqualTo(linkp)) continue;
            addMemStruct(mem, STRUCTURE_EXTENSION, kSrcExtensionLevel, ep.xy);
        }

        const meta = new this(mem, man);
        meta.myspot = self.xy;

        return meta;
    }

    // Metas planned before Sept 2026 had their extensions and container at
    // RCL3, which let the cap field's RCL2 extensions build first despite the
    // lower priority; both move down to their current levels.
    migrate(): boolean {
        let changed = false;
        for (const [stype, lvl] of [[STRUCTURE_EXTENSION, kSrcExtensionLevel], [STRUCTURE_CONTAINER, kSrcContainerLevel]] as [BuildableStructureConstant, PlanLevel][]) {
            const lvls = this.mem.structs[stype];
            if (!lvls || !lvls[3]) continue;
            lvls[lvl] = [...(lvls[lvl] || []), ...lvls[3]];
            delete lvls[3];
            changed = true;
        }
        return changed;
    }

    // The container waits for a spawn below kSrcContainerFreeLevel.
    findSite(stype: BuildableStructureConstant, room: Room): [RoomPosition | null, Structure | ConstructionSite | null] {
        if (stype === STRUCTURE_CONTAINER && roomLevel(room) < kSrcContainerFreeLevel &&
            !room.findStructs(STRUCTURE_SPAWN).length) return [null, null];
        return super.findSite(stype, room);
    }
    static pickSpot(f: FlagExtra, man: MetaManager, cm: CostMatrix, t: RoomTerrain, best: RoomPosition, storep: RoomPosition): RoomPosition {
        let rank = 0;
        if (f.secondaryColor === COLOR_RED) rank = 1;
        if (f.secondaryColor === COLOR_PURPLE) rank = 2;
        if (rank === 0) return best;

        const others = [] as { pos: RoomPosition, cost: number }[];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = f.pos.x + dx;
                const y = f.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const terrain = t.get(x, y);
                if (terrain & TERRAIN_MASK_WALL) continue;
                const pos = new RoomPosition(x, y, f.pos.roomName);
                if (pos.isEqualTo(best)) continue;
                const ret = man.path(cm, pos, [{ pos: storep, range: 1 }]);
                if (ret.incomplete) continue;
                // Entering this tile costs its weight plus terrain, like the first step did.
                const enter = cm.get(x, y) + ((terrain & TERRAIN_MASK_SWAMP) ? kPathSwamp : kPathPlain);
                others.push({ pos, cost: ret.cost + enter });
            }
        }
        if (!others.length) return best;
        const sorted = _.sortBy(others, o => o.cost);
        const pick = sorted[Math.min(rank - 1, sorted.length - 1)].pos;
        f.log("spot rank", rank + 1, "of", sorted.length + 1, pick);
        return pick;
    }
    // To beside the container (the srcer's spot).
    traffic(): TrafficMem[] {
        return this.originTraffic(this.myspot, 1);
    }
    targetid<S extends AnyStructure>(): Id<S> {
        const room = Game.rooms[this.manager.name];
        if (!room) return super.targetid<S>();

        const [x, y] = coordsFromXY(this.mem.xy);
        const src = _.first(room.lookForAt(LOOK_SOURCES, x, y));

        if (!src) return super.targetid<S>();
        return src.id as unknown as Id<S>;
    }
    spawnEnergyFirst() {
        return this.getSpawnEnergies();
    }
    getLinkMode(xy: number) {
        if (this.hasAny(STRUCTURE_LINK, xy)) return Mode.src;
        return Mode.pause;
    }
}

@registerMeta
class Meta_bsrc extends Meta_asrc { }

// Minerals need an extractor on the mineral tile (RCL6) and something to
// carry the yield. The single per-room extractor allowance is spent by
// makeSite in meta priority order, so Meta_reactor (thorium) outranks this.
const kMineralLevel: PlanLevel = 6;
const kReactorPriority = 10;

// The mineral within `range` of the flag matching `pick`, else null.
function flagMineral(f: FlagExtra, range: number, pick: (m: Mineral) => boolean): Mineral | null {
    if (!f.room) {
        f.log("needs vision to find its mineral");
        return null;
    }
    return f.pos.findInRange(FIND_MINERALS, range, { filter: pick })[0] || null;
}

// A lone container on the flag tile (a drop point, a parking spot for
// energy). Priority well below every other container holder so it is the
// last one makeSite spends CONTROLLER_STRUCTURES on and the one purge()
// tears down when a higher meta's container is short. Asks for a road from
// the traffic origin (the storage, else the genesis flag) to the tile.
const kContPriority = -10;
const kContLevel: PlanLevel = 1;
@registerMeta
class Meta_cont extends MetaStructure {
    static plan(f: FlagExtra, man: MetaManager) {
        const mem = MetaStructure.makeMem(f);
        mem.priority = kContPriority;
        addMemStruct(mem, STRUCTURE_CONTAINER, kContLevel, f.pos.xy);
        mem.points['cont'] = f.pos.xy;
        return new this(mem, man);
    }
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 1);
    }
}

@registerMeta
class Meta_min extends MetaStructure {
    // Flag beside an ordinary mineral: container (the standing spot) on the
    // flag tile, extractor on the mineral. Thorium belongs to Meta_reactor.
    static plan(f: FlagExtra, man: MetaManager) {
        const min = flagMineral(f, 1, m => m.mineralType !== RESOURCE_THORIUM && !m.pos.isEqualTo(f.pos));
        if (!min) {
            f.log("no mineral beside the flag (it must not sit on the mineral)");
            return null;
        }
        const mem = MetaStructure.makeMem(f);
        addMemStruct(mem, STRUCTURE_EXTRACTOR, kMineralLevel, min.pos.xy);
        addMemStruct(mem, STRUCTURE_CONTAINER, kMineralLevel, f.pos.xy);
        mem.points['mineral'] = f.pos.xy;
        return new this(mem, man);
    }
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 1);
    }
}

@registerMeta
class Meta_reactor extends MetaStructure {
    // Season 11: an extractor over the thorium mineral, nothing else. Warboys
    // (job.warboy) carry the thorium straight to the sector core, so there is
    // no container and no road destination. Flag on or beside the thorium.
    static plan(f: FlagExtra, man: MetaManager) {
        const min = flagMineral(f, 1, m => m.mineralType === RESOURCE_THORIUM);
        if (!min) {
            f.log("no thorium mineral on or beside the flag");
            return null;
        }
        const mem = MetaStructure.makeMem(f);
        mem.priority = kReactorPriority;
        addMemStruct(mem, STRUCTURE_EXTRACTOR, kMineralLevel, min.pos.xy);
        return new this(mem, man);
    }
}

const kCtrlContainerLevel: PlanLevel = 2;
// Links unlock at RCL5 (CONTROLLER_STRUCTURES.link) but the two RCL5 links go
// to the asrc/bsrc metas; the ctrl link is the third, at RCL6. The container is
// retired the same level, then decays unrepaired.
const kCtrlLinkLevel: PlanLevel = 6;

@registerMeta
class Meta_ctrl extends MetaStructure {
    static plan(f: FlagExtra, man: MetaManager) {
        const p = storageOrParent(f, man);
        if (!p) return null;
        const cm = man.getMatrix([f.role]);
        const ret = man.path(cm, f.pos, [{ pos: p, range: 1 }]);
        const v = new RoomVisual(man.name);
        for (const pos of ret.path) {
            v.circle(pos.x, pos.y);
        }
        const mem = MetaStructure.makeMem(f);
        const ctrl = f.room?.controller;
        if (ctrl && !ctrl.pos.isEqualTo(f.pos)) {
            // Flag placed off the controller: stand on the flag, link on the next step to storage.
            if (ret.path.length < 1) return null;
            if (!ctrl.pos.inRangeTo(f.pos, 3)) f.log("ctrl spot out of upgrade range", f.pos);
            mem.points[calcRole(mem.name)] = toXY(f.pos);
            addMemStruct(mem, STRUCTURE_LINK, kCtrlLinkLevel, ret.path[0].xy);
            Meta_ctrl.addContainer(mem);
            return new this(mem, man);
        }
        if (ret.path.length < 4) return null;
        mem.points[calcRole(mem.name)] = ret.path[2].xy;
        addMemStruct(mem, STRUCTURE_LINK, kCtrlLinkLevel, ret.path[3].xy);
        Meta_ctrl.addContainer(mem);
        return new this(mem, man);
    }

    // Upgrader buffer under the ctrl creep (container mode 'sink': haulers fill
    // it). Built from RCL kCtrlContainerLevel, retired once the link can be
    // built; being a container it then decays rather than being destroyed.
    // Replaces role.ctrl.js structAtSpot.
    static addContainer(mem: MetaMem) {
        const xy = mem.points[calcRole(mem.name)];
        addMemStruct(mem, STRUCTURE_CONTAINER, kCtrlContainerLevel, xy);
        addMemRetire(mem, xy, Number(kCtrlLinkLevel));
    }

    // Metas planned before Sept 2026: move the link from RCL5 to kCtrlLinkLevel
    // and add the retiring container.
    migrate(): boolean {
        let changed = false;
        const links = this.mem.structs[STRUCTURE_LINK];
        if (links && links[5] && !links[kCtrlLinkLevel as 6]) {
            links[kCtrlLinkLevel as 6] = links[5];
            delete links[5];
            changed = true;
        }
        if (!this.mem.structs[STRUCTURE_CONTAINER] && this.mem.points[calcRole(this.name)] !== undefined) {
            Meta_ctrl.addContainer(this.mem);
            changed = true;
        }
        return changed;
    }
    // To beside the ctrl spot.
    traffic(): TrafficMem[] {
        return this.originTraffic(this.myspot, 1);
    }
    getLinkMode(xy: number) {
        if (this.hasAny(STRUCTURE_LINK, xy)) return Mode.sink;
        return Mode.pause;
    }
}

@registerMeta
class Meta_tripod extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const legend: legend = {
            l: [8, STRUCTURE_LINK],
            r: [8, STRUCTURE_ROAD],
            t: [8, STRUCTURE_TOWER],
        };
        const parkedLayout = `
            ..t
            .0.
            t.t`;
        const deployedLayout = `
            lrt
            r0r
            trt`;
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, ['tripod'], parkedLayout);
        addMemSpotRampart(mem, 'tripod', 8);
        addMemRamparts(mem, STRUCTURE_TOWER);
        return new this(mem, man);
    }
    maxHits(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        return this.calcStructHits(stype, xy, rcl) ||
            this.calcRampBldgHits([STRUCTURE_TOWER], xy, rcl) ||
            this.calcRampSpotHits(xy, rcl);
    }
    getLinkMode(xy: number) {
        if (this.hasAny(STRUCTURE_LINK, xy)) return Mode.sink;
        return Mode.pause;
    }
}

// MetaManager's traffic plan (memory.traffic) as a MetaStructure, so upkeep,
// maxHits, fillMatrix and draw treat its roads like any meta's. Not a meta:
// never in man.metas, never saved among them, planned by the manager
// (updateTraffic) from what the metas declare, not by a flag.
class TrafficPlan extends MetaStructure {
    mem: TrafficPlanMem;
    // It is what the declarations became; it declares nothing itself.
    traffic(): TrafficMem[] {
        return [];
    }
}

function newTrafficMem(xy: number): TrafficPlanMem {
    return { name: kTrafficName, xy, color: COLOR_WHITE, points: {}, structs: {}, sig: "" };
}

function nearWall(t: RoomTerrain, x: number, y: number): boolean {
    if (t.get(x + 1, y) & TERRAIN_MASK_WALL) return true;
    if (t.get(x - 1, y) & TERRAIN_MASK_WALL) return true;
    if (t.get(x, y + 1) & TERRAIN_MASK_WALL) return true;
    if (t.get(x, y - 1) & TERRAIN_MASK_WALL) return true;
    return false;
}


// A barrier line through the flag: east and west of it along its row, or,
// with the flag coloured RED, north and south along its column. Each way it
// runs until terrain wall or the room edge. The flag tile, every tile beside
// terrain wall and every other tile in between are ramparts; the rest are
// constructed walls. A road parallel to the line (both ways, from the first
// step of the flag's path to the storage that is more than 2 tiles out) and
// an on-ramp (road + rampart) from every rampart to it let our creeps cross.
// Needs the saved storage site. With the storage right beside the flag
// there is no room for the road, so only the line is planned.
@registerMeta
class Meta_wall extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const spos = man.getSite(STRUCTURE_STORAGE);
        if (!spos) return null;

        const mem = MetaStructure.makeMem(f);

        const t = new Room.Terrain(f.pos.roomName);

        const cm = man.getMatrix([f.self]);

        const vertical = f.color === COLOR_RED;
        // The tile `d` steps along the line from `from`.
        const along = (from: { x: number, y: number }, d: number): [number, number] =>
            vertical ? [from.x, from.y + d] : [from.x + d, from.y];
        const inRoom = (x: number, y: number) => x >= 1 && x <= 48 && y >= 1 && y <= 48;

        addMemStruct(mem, STRUCTURE_RAMPART, 3, f.pos.xy);
        cm.set(f.pos.x, f.pos.y, 100);
        const ramps = [f.pos];

        for (const dir of [1, -1]) {
            for (let d = 1; d < 50; d++) {
                const [x, y] = along(f.pos, dir * d);
                if (!inRoom(x, y)) break;
                if (t.get(x, y) & TERRAIN_MASK_WALL) break;
                cm.set(x, y, 100);
                if (nearWall(t, x, y) || d % 2 === 0) {
                    addMemStruct(mem, STRUCTURE_RAMPART, 3, coordsToXY(x, y));
                    ramps.push(new RoomPosition(x, y, f.pos.roomName));
                } else {
                    addMemStruct(mem, STRUCTURE_WALL, 3, coordsToXY(x, y));
                }
            }
        }

        const roadWeight = Math.floor(kPathRoad / 2);

        // The road runs parallel to the line, through the first step toward
        // the storage that clears the line by more than 2 tiles. With the
        // storage that close there is no room for one: plan the line alone.
        const roads: RoomPosition[] = [];
        const ret = man.path(cm, f.pos, [{ pos: spos, range: 1 }]);
        const dpos = _.find(ret.path, p => p.getRangeTo(f) > 2);
        if (!dpos) {
            f.log("wall: storage too close for a parallel road, line only");
            cleanMem(mem);
            return new this(mem, man);
        }
        for (const dir of [1, -1]) {
            for (let d = dir > 0 ? 0 : 1; d < 50; d++) {
                const [x, y] = along(dpos, dir * d);
                if (!inRoom(x, y)) break;
                if (t.get(x, y) & TERRAIN_MASK_WALL) break;
                addMemStruct(mem, STRUCTURE_ROAD, 3, coordsToXY(x, y));
                roads.push(new RoomPosition(x, y, f.pos.roomName));
                cm.set(x, y, roadWeight);
            }
        }
        mem.onramps = [];
        for (const rpos of ramps) {
            const ret = man.path(cm, rpos, roads.map(p => { return { pos: p, range: 1 }; }));
            for (const p of ret.path) {
                mem.onramps.push(p.xy);
                cm.set(p.x, p.y, roadWeight);
                addMemStruct(mem, STRUCTURE_ROAD, 3, p.xy);
                addMemStruct(mem, STRUCTURE_RAMPART, 3, p.xy);
            }
        }

        cleanMem(mem);

        return new this(mem, man);
    }

    maxHits(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        if (stype === STRUCTURE_RAMPART && _.contains(this.mem.onramps!, xy)) {
            return this.calcRampWallHits(stype, xy, rcl-3);
        }

        return this.calcRampWallHits(stype, xy, rcl) || this.calcStructHits(stype, xy, rcl);
    }

    // To the flag's rampart.
    traffic(): TrafficMem[] {
        return this.originTraffic(this.mem.xy, 0);
    }
}

// Ramparts sealing a gap off from the base. The gap is the flag's row from
// terrain wall to terrain wall through the flag (the tiles under it, left
// and right). Every gap tile is a range-2 goal in one PathFinder search from
// the parent (genesis) flag, one room only, on a terrain-only matrix. A path
// ends the moment it enters that range-2 band, so it never crosses the gap;
// the tile it reaches gets a rampart and is made impassable, and the search
// repeats until no path is left. The ramparts end up as a shell at range 2
// on the base's side of the gap that our creeps can cross and nothing else
// can. Bounded by kShieldMaxRamparts and the CPU gate (shed.canRun); an
// incomplete search counts as no path, so it never places a rampart short
// of the gap.
const kShieldMaxRamparts = 80;
const kShieldOps = 4000;

@registerMeta
class Meta_shield extends MetaStructure {
    static plan(f: FlagExtra, man: MetaManager) {
        const parent = f.parent;
        if (!parent || parent.pos.roomName !== f.pos.roomName) {
            f.log("shield: needs its parent flag in the room");
            return null;
        }
        const roomName = f.pos.roomName;
        const t = Game.map.getRoomTerrain(roomName);

        // We don't care about anything other than terrain
        const cm = new PathFinder.CostMatrix();

        // The gap: the flag's row out to terrain wall each way, flag included.
        // The range 2 addition prevents any path from getting within 2 of any part of the gap.
        // This prevent cutting across the exit tiles.
        const gap: Goal[] = [{ pos: f.pos, range: 2 }];
        for (const dir of [1, -1]) {
            for (let d = 1; d < 50; d++) {
                const x = f.pos.x + dir * d;
                if (x < 0 || x > 49) break;
                if (t.get(x, f.pos.y) & TERRAIN_MASK_WALL) break;
                gap.push({pos: new RoomPosition(x, f.pos.y, roomName), range: 2});
            }
        }

        const mem = MetaStructure.makeMem(f);
        let n = 0;
        while (n < kShieldMaxRamparts && canRun(Game.cpu.getUsed(), 9000)) {
            const ret = PathFinder.search(parent.pos, gap, {
                plainCost: 1,
                swampCost: 1,
                maxRooms: 1,
                maxOps: kShieldOps,
                roomCallback: name => name === roomName ? cm : false,
            });
            if (ret.incomplete || !ret.path.length) break;
            const end = _.last(ret.path);
            cm.set(end.x, end.y, 0xFF);
            addMemStruct(mem, STRUCTURE_RAMPART, 3, end.xy);
            n++;
        }
        f.log("shield:", n, "ramparts across a gap of", gap.length, "tiles");
        if (!n) return null;

        cleanMem(mem);
        return new this(mem, man);
    }

    maxHits(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        return this.calcRampWallHits(stype, xy, rcl);
    }
}

export function checkNukes(room: Room) {
    const nukes = room.find(FIND_NUKES);
    if (!nukes.length) return;

    const antinuke = 'nuke_' + room.name;
    const f = Game.flags[antinuke];
    if (!f) {
        const x = 20 + _.random(0, 10);
        const y = 20 + _.random(0, 10);
        room.createFlag(x, y, antinuke, COLOR_CYAN, COLOR_CYAN);
        return;
    }
}

function antinuke(f: Flag) {
    const room = f.room;
    if (!room) return;
    const nukes = room.find(FIND_NUKES);
    const meta = room.meta.getMeta('nuke') as Meta_nuke;
    if (!meta) {
        if (nukes.length === 0) {
            f.remove();
            return;
        }
        const newmeta = Meta_nuke.plan(f, room.meta);
        if (newmeta) room.meta.setMeta(newmeta);
        return;
    }
    if (nukes.length === 0) {
        f.room?.meta.deleteMeta(meta.name);
        return;
    }
}


interface NukeMem extends MetaMem {
    blast: Record<number, number>
}


@registerMeta
class Meta_nuke extends MetaStructure {
    mem: NukeMem;
    skip: boolean;
    static plan(f: Flag, man: MetaManager) {
        const room = f.room;
        if (!room) return null;
        const mem = this.makeMem(f) as NukeMem;
        // Higher than all others.
        mem.priority = 200;
        mem.blast = {};

        const nukes = room.find(FIND_NUKES);
        //const nukes = [{ pos: f.pos }];

        for (const nuke of nukes) {
            for (let dx = -2; dx <= 2; dx++) {
                const x = nuke.pos.x + dx;
                for (let dy = -2; dy <= 2; dy++) {
                    const y = nuke.pos.y + dy;
                    const xy = coordsToXY(x, y);
                    let base = mem.blast[xy] || 0;
                    if (dx === 0 && dy === 0) {
                        mem.blast[xy] = base + (NUKE_DAMAGE[0] / 1000000);
                    } else {
                        mem.blast[xy] = base + (NUKE_DAMAGE[2] / 1000000);
                    }
                }
            }
        }

        for (const meta of man.metas) {
            for (const stypekey in meta.mem.structs) {
                const stype = stypekey as BuildableStructureConstant;
                if (stype === STRUCTURE_ROAD) continue;
                if (stype === STRUCTURE_EXTRACTOR) continue;
                if (stype === STRUCTURE_OBSERVER) continue;
                if (stype === STRUCTURE_CONTAINER) continue;
                const lvls = meta.mem.structs[stype]!;
                for (const lvlkey in lvls) {
                    const lvl = lvlkey as PlanLevel;
                    for (const xy of lvls[lvl]!) {
                        if (stype === STRUCTURE_WALL) {
                            addMemStruct(mem, STRUCTURE_WALL, 6, xy);
                        } else if (stype === STRUCTURE_RAMPART) {
                            addMemStruct(mem, STRUCTURE_RAMPART, 6, xy);
                        } else if (mem.blast[xy]) {
                            addMemStruct(mem, STRUCTURE_RAMPART, 6, xy);
                        }
                    }
                }
            }
        }
        cleanMem(mem);
        return new this(mem, man);
    }

    maxHits(stype: BuildableStructureConstant, xy: number, rcl:number): MAXHITS {
        if (this.skip) return MAXHITS.Unknown;
        if (this.calcRampWallHits(stype, xy, rcl)) {
            const blast = this.mem.blast[xy] || 0;
            if (blast) {
                return (blast + 1) * MAXHITS.Scale;
            }
            this.skip = true;
            const baseHits = this.manager.maxHitsInner(stype, xy, rcl);
            this.skip = false;

            return Math.max(Math.floor(baseHits/2), MAXHITS.Low);
        }
        return this.calcStructHits(stype, xy, rcl);
    }

    draw(v: RoomVisual) {
        for (let xy in this.mem.blast) {
            const [x, y] = coordsFromXY(parseInt(xy));
            //v.circle(x, y, {fill: 'red'});
            v.text("" + (this.mem.blast[xy] / 1000000), x, y);
        }
    }
}