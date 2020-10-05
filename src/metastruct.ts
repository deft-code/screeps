import { FlagExtra } from "flag";
import { merge } from "lib";
import { coordsToXY, coordsFromXY, toXY, fromXY, Goal } from "Rewalker";
import { canRun } from "shed";
import { isSType, isOwnedStruct } from "guards";
import { Mode } from "struct.link";

declare global {
    interface Flag {
        runMeta(): void
    }
    interface Room {
        meta: MetaManager
    }
    interface RoomCache {
        meta?: MetaManager
    }
    interface FlagMemory {
        newer?: any
    }
}

function calcRole(name: string): string {
    return _.words(name)[0].toLowerCase();
}

const kPathRoad = 7;
const kPathPlain = 11;
const kPathSwamp = 12;

class RoomMetaExtra extends Room {
    get meta(): MetaManager {
        if (!this.cache.meta) {
            return this.cache.meta = new MetaManager(this.name);
        }
        return this.cache.meta;
    }
}
merge(Room, RoomMetaExtra);

enum MAXHITS {
    Unknown = 0,
    Skip = 1,
    Full = 2,
    Mega = 100,
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
    }
    if (hits < MAXHITS.Mega) {
        return 100 * hits;
    }

    return (hits - MAXHITS.Mega) * 1000000;
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
merge(Flag, MetaPlan);


// Grey, create child flags
// White, remove child flags
// Brown, delete brown metas
// Yellow, acquire all child flags
// Green, save all changed metas to room manager
// Blue, force replanning for all metas.
function runGenesis(f: MetaPlan) {
    //man.save();
    const newer = f.memory.newer = f.memory.newer || {};
    const room = f.room;
    if (!room) return;
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
    let i = -1;
    for (const child of room.find(FIND_FLAGS) as FlagExtra[]) {
        i++;
        if (child.parentName !== f.name) continue;
        if (f.secondaryColor === COLOR_WHITE) {
            child.remove();
            changed = true;
            continue;
        }
        let nextm = null as MetaStructure | null;
        const meta = room.meta.getMeta(child.self);
        if (!meta) {
            if (f.secondaryColor === COLOR_BROWN && child.secondaryColor === COLOR_BROWN) {
                child.remove()
                changed = true;
                room.visual.line(f.pos, child.pos, { color: "brown" });
                continue;
            }
            const mem = newer[child.self];
            if (!mem) {
                if (f.secondaryColor === COLOR_YELLOW) {
                    nextm = planMeta(child);
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
        }
    }
    if (changed && _.contains([COLOR_GREEN, COLOR_BROWN], f.secondaryColor)) room.meta.save();
    if (!changed && f.secondaryColor !== COLOR_CYAN) f.setColor(f.color, COLOR_CYAN);
}

type PlanLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
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

function addMemStruct(mem: MetaMem, stype: BuildableStructureConstant, lvl: PlanLevel, xy: number) {
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
            xy => addMemStruct(mem, STRUCTURE_RAMPART, lvl! as PlanLevel, xy)));
}

function cleanMem(mem: MetaMem) {
    _.forEach(mem.structs, lvls => _.forEach(lvls!, (xys, lvl) => lvls![lvl as PlanLevel] = _.uniq(xys!)));
}

interface ManagerMem {
    metas: MetaMem[]
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

interface MetaMem {
    name: string
    color: ColorConstant
    priority?: number
    xy: number
    points: MetaPoints
    structs: MetaStructs
    onramps?: number[]
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

class MetaManager {
    metas: MetaStructure[]
    birth = 0
    begin = 0
    wallHits = 20;
    constructor(readonly name: string) {
        const metaMem = this.memory;
        this.metas = _.compact(_.map(metaMem.metas, mem => newMeta(mem, this))) as MetaStructure[];
        this.metas.sort(metaOrder);
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

    save() {
        const metaMem = this.memory;
        delete metaMem.drop;
        delete metaMem.keep;
        delete metaMem.roaddrop;
        delete metaMem.roadkeep;
        delete metaMem[STRUCTURE_RAMPART];
        delete metaMem[STRUCTURE_WALL];
        metaMem.metas = _.map(this.metas, meta => meta.mem);
    }

    run() {
        const room = Game.rooms[this.name];
        if (!room) return;

        if (Game.time < this.birth + this.begin) {
            Game.rooms[this.name].dlog("Anti-thrashing");
            //return 
        }

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
            this.makeExtractor() ||
            this.makeSite(STRUCTURE_LAB) ||
            this.makeSite(STRUCTURE_OBSERVER) ||
            this.makeSite(STRUCTURE_NUKER) ||
            this.makeSite(STRUCTURE_POWER_SPAWN) ||
            this.makeSite(STRUCTURE_FACTORY) ||
            this.makeSite(STRUCTURE_RAMPART) ||
            this.makeSite(STRUCTURE_ROAD) ||
            false
            ;
    }

    getMeta(name: string): MetaStructure | null {
        return _.find(this.metas, meta => meta.name === name) || null;
    }

    deleteMeta(name: string) {
        _.remove(this.metas, m => m.name === name);
    }

    setMeta(meta: MetaStructure) {
        _.remove(this.metas, m => m.name === meta.name);
        this.metas.push(meta);
        this.metas.sort((l, r) => {
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
        });
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

    getMatrix(exclude: string[] = []) {
        const cm = new PathFinder.CostMatrix();
        for (const meta of this.metas) {
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

    getDests(): Goal[] {
        const dests: Goal[] = [];
        for (const meta of this.metas) {
            for (const [xy, range] of meta.dests()) {
                const pos = fromXY(xy, this.name);
                dests.push({ pos, range });
            }
        }
        return dests;
    }

    makeExtractor(): boolean {
        const room = Game.rooms[this.name];
        if (!room) return false;

        const min = _.first(room.find(FIND_MINERALS));

        const [free, blocker] = checkSitePos(min.pos, STRUCTURE_EXTRACTOR);
        if (free) {
            const ret = free.createConstructionSite(STRUCTURE_EXTRACTOR);
            if (ret === OK) return true;
            room.errlog(ret, "Failed  to create extractor", free.xy, "blocker", blocker);
        }
        if (blocker) {
            return this.removeDestroy(blocker);
        }
        return false;
    }

    makeSite(stype: BuildableStructureConstant): boolean {
        const room = Game.rooms[this.name];
        if (!room) return false;
        let blocker: blocker = null;
        for (const meta of this.metas) {
            const [free, newblocker] = meta.findSite(stype, room);
            if (free) {
                const ret = free.createConstructionSite(stype);
                if (ret === OK) return true;
                if (ret === ERR_RCL_NOT_ENOUGH) return this.purgeOptional(stype);
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
        for (const meta of this.metas) {
            const [free, newblocker] = meta.findOptional(stype, room);
            if (free) {
                const ret = free.createConstructionSite(stype);
                if (ret === OK) return true;
                if (ret === ERR_RCL_NOT_ENOUGH) return this.purge(stype);
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
            const xys = lvls[9];
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
        for (const struct of structs) {
            const m = _.find(this.metas, m => m.has(stype, rcl, struct.pos.xy));
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
            s.room?.errlog(err, "failed to remove site:", s);
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

    maxHits(stype: BuildableStructureConstant, xy: number): number {
        const mh = this.cachedMaxHits(stype, xy);
        if(mh !== MAXHITS.Unknown) return translateMaxHits(stype, mh);

        const newmh = this.maxHitsInner(stype, xy);
        this.addMaxHits(stype, xy, newmh);

        return translateMaxHits(stype, mh);
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

    maxHitsInner(stype: BuildableStructureConstant, xy: number): MAXHITS {
        for (const meta of this.metas) {
            const mh = meta.maxHits(stype, xy);
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

function roomLevel(room: Room): PlanLevel {
    if (!room.controller) return 0;
    if (!room.controller.my) return 0;
    return room.controller.level as PlanLevel;
}

class MetaStructure {
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

    pointDests(): [number, number][] {
        return _.map(this.mem.points, xy => [xy, 1] as [number, number]);
    }

    dests(): [number, number][] {
        return [];
    }

    // Does this meta manage a an stype at up to maxLvl
    has(stype: BuildableStructureConstant, maxLvl: number, xy: number): boolean {
        const lvls = this.mem.structs[stype];
        if (!lvls) return false;
        const optxys = lvls[9];
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
                        cm.set(x, y, 10);
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
        return this.findXys(lvls[9], stype, room);
    }

    findXys(xys: undefined | number[], stype: BuildableStructureConstant, room: Room): [RoomPosition | null, Structure | ConstructionSite | null] {
        if (!xys) return [null, null];
        let blocker: Structure | ConstructionSite | null = null;
        for (const xy of xys!) {
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
        _.forEach(this.mem.structs, (lvls, stype) =>
            _.forEach(lvls!, xys =>
                xys!.forEach(xy => {
                    const [x, y] = coordsFromXY(xy);
                    const p = new RoomPosition(x, y, v.roomName);
                    if (_.any(p.lookFor(LOOK_STRUCTURES), s => s.structureType === stype)) return
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

    maxHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        return this.calcStructHits(stype, xy);
    }

    calcRampWallHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        if (stype === STRUCTURE_RAMPART && this.hasAny(STRUCTURE_RAMPART, xy)) return this.manager.wallHits + MAXHITS.Mega;
        if (stype === STRUCTURE_WALL && this.hasAny(STRUCTURE_WALL, xy)) return this.manager.wallHits + MAXHITS.Mega;
        return MAXHITS.Unknown;
    }

    calcRampBldgHits(stypes: BuildableStructureConstant[], xy: number): MAXHITS {
        for (const stype of stypes) {
            if (this.hasAny(stype, xy)) return this.manager.wallHits + MAXHITS.Mega;
        }
        return MAXHITS.Unknown;
    }

    calcStructHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        if (stype === STRUCTURE_RAMPART || stype === STRUCTURE_WALL) return MAXHITS.Unknown;
        if (this.hasAny(stype, xy)) return MAXHITS.Full;
        return MAXHITS.Unknown;
    }

    calcRampSpotHits(xy: number): MAXHITS {
        if (_.any(this.mem.points, pxy => pxy === xy)) return this.manager.wallHits + MAXHITS.Mega;
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

type MetaCtor = typeof MetaStructure & { plan(f: Flag, man: MetaManager): MetaStructure | null };
const allMetas = new Map<string, MetaCtor>();

function registerMeta(klass: MetaCtor) {
    allMetas.set(klass.name, klass);
}

function planMeta(f: Flag) {
    const role = calcRole(f.name);
    f.log("Planning Meta", role);
    const klassName = 'Meta_' + role;
    const klass = allMetas.get(klassName);
    if (!klass) return null;
    const man = f.room!.meta;
    return klass.plan(f, man);
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

    dests(): [number, number][] {
        const s = this.getSite(STRUCTURE_STORAGE)!;
        const t = this.getSite(STRUCTURE_TERMINAL)!;
        return [[s, 1], [t, 1]];
    }

    spawnEnergyFirst() {
        return this.getSpawnEnergies();
    }

    maxHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        const ramped = [
            STRUCTURE_FACTORY,
            STRUCTURE_POWER_SPAWN,
            STRUCTURE_SPAWN,
            STRUCTURE_STORAGE,
            STRUCTURE_TERMINAL,
            STRUCTURE_TOWER,
        ];
        return this.calcStructHits(stype, xy) ||
            this.calcRampBldgHits(ramped, xy) ||
            this.calcRampSpotHits(xy);
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
    dests(): [number, number][] {
        return [[this.mem.xy, 2]]
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
            s: [9, STRUCTURE_SPAWN],
            o: [8, STRUCTURE_OBSERVER],
            n: [8, STRUCTURE_NUKER],
        }
        const layout = `
            bcrbr
            crars
            rarcr
            brcan
            rsro.`;
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, [], layout);
        addMemRamparts(mem, STRUCTURE_SPAWN);
        return new this(mem, man);
    }
    dests(): [number, number][] {
        return [[this.mem.xy, 1]];
    }
    spawnEnergyLast() {
        return this.getSpawnEnergies();
    }
    maxHits(stype: BuildableStructureConstant, xy: number): number {
        return this.calcStructHits(stype, xy) ||
            this.calcRampBldgHits([STRUCTURE_SPAWN], xy);
    }
}

class Meta_extn extends MetaStructure {
    static layout: string;
    static plan(f: Flag, man: MetaManager) {
        const legend: legend = {
            e: [9, STRUCTURE_EXTENSION],
            r: [5, STRUCTURE_ROAD],
        };
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, [], this.layout);
        return new this(mem, man);
    }
}

@registerMeta
class Meta_extna extends Meta_extn {
    static layout = `
        ere
        rer
        ere`;
    dests(): [number, number][] {
        return [[this.mem.xy, 1]];
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
    dests(): [number, number][] {
        return [[this.mem.xy, 2]];
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
    dests(): [number, number][] {
        return [[this.mem.xy, 3]];
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

@registerMeta
class Meta_asrc extends MetaStructure {
    static plan(f: FlagExtra, man: MetaManager) {
        const storep = man.getSite(STRUCTURE_STORAGE);
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

        const self = ret.path[0];
        addMemStruct(mem, STRUCTURE_CONTAINER, 3, self.xy);

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
        addMemStruct(mem, STRUCTURE_ROAD, 9, roadp.xy);

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
            addMemStruct(mem, STRUCTURE_EXTENSION, 3, ep.xy);
        }

        const meta = new this(mem, man);
        meta.myspot = self.xy;

        return meta;
    }
    dests(): [number, number][] {
        return this.pointDests();
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

@registerMeta
class Meta_min extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const mem = MetaStructure.makeMem(f);
        addMemStruct(mem, STRUCTURE_CONTAINER, 6, f.pos.xy);
        mem.points['mineral'] = f.pos.xy;
        return new this(mem, man);
    }
    dests(): [number, number][] {
        return [[this.mem.xy, 1]];
    }
    // draw(v: RoomVisual) {
    //     const [x, y] = coordsFromXY(this.mem.xy);
    //     v.structure(x, y, STRUCTURE_CONTAINER, { opacity: 0.5 });
    // }
}

@registerMeta
class Meta_ctrl extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const p = man.getSite(STRUCTURE_STORAGE);
        if (!p) return null;
        const cm = man.getMatrix([f.role]);
        const ret = man.path(cm, f.pos, [{ pos: p, range: 1 }]);
        if (ret.path.length < 4) return null;
        const v = new RoomVisual(man.name);
        for (const pos of ret.path) {
            v.circle(pos.x, pos.y);
        }
        const mem = MetaStructure.makeMem(f);
        mem.points[calcRole(mem.name)] = ret.path[2].xy;
        addMemStruct(mem, STRUCTURE_LINK, 5, ret.path[3].xy);
        return new this(mem, man);
    }
    dests(): [number, number][] {
        return this.pointDests();
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
    maxHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        return this.calcStructHits(stype, xy) ||
            this.calcRampBldgHits([STRUCTURE_TOWER], xy) ||
            this.calcRampSpotHits(xy);
    }
    getLinkMode(xy: number) {
        if (this.hasAny(STRUCTURE_LINK, xy)) return Mode.sink;
        return Mode.pause;
    }
}

@registerMeta
class Meta_traffic extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const s = man.getSite(STRUCTURE_STORAGE);
        if (!s) return null;
        const t = man.getSite(STRUCTURE_TERMINAL);
        if (!t) return null;

        const sps = man.getSites(STRUCTURE_SPAWN);
        if (sps.length < 3) return null;

        const dests = man.getDests();
        if (dests.length < 0) return null;

        const tdests = _.clone(dests);

        const mem = MetaStructure.makeMem(f);
        const cm = man.getMatrix([f.role]);
        this.wrapPosition(mem, cm, s);
        this.wrapPosition(mem, cm, t);
        sps.forEach(sp => this.wrapPosition(mem, cm, sp));
        this.planTraffic(mem, man, cm, s, dests);
        this.planTraffic(mem, man, cm, t, tdests);

        return new this(mem, man);
    }

    static wrapPosition(mem: MetaMem, cm: CostMatrix, p: RoomPosition) {
        const t = Game.map.getRoomTerrain(p.roomName);
        for (let dx = -1; dx <= 1; dx++) {
            const x = p.x + dx;
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const y = p.y + dy;
                if (t.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (cm.get(x, y) < 0xFE) {
                    cm.set(x, y, kPathRoad);
                    addMemStruct(mem, STRUCTURE_ROAD, 3, coordsToXY(x, y));
                }
            }
        }
    }

    static planTraffic(mem: MetaMem, man: MetaManager, cm: CostMatrix, from: RoomPosition, dests: Goal[]) {
        while (canRun(Game.cpu.getUsed(), 9000) && dests.length > 0) {
            const ret = man.path(cm, from, dests);
            const last = _.last(ret.path) || from;
            _.remove(dests, g => last.inRangeTo(g.pos, g.range));
            ret.path.forEach(pos => {
                addMemStruct(mem, STRUCTURE_ROAD, 3, pos.xy);
                cm.set(pos.x, pos.y, kPathRoad);
            });
        }
    }
}

function nearWall(t: RoomTerrain, x: number, y: number): boolean {
    if (t.get(x + 1, y) & TERRAIN_MASK_WALL) return true;
    if (t.get(x - 1, y) & TERRAIN_MASK_WALL) return true;
    if (t.get(x, y + 1) & TERRAIN_MASK_WALL) return true;
    if (t.get(x, y - 1) & TERRAIN_MASK_WALL) return true;
    return false;
}


@registerMeta
class Meta_wall extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const spos = man.getSite(STRUCTURE_STORAGE);
        if (!spos) return null;

        const mem = MetaStructure.makeMem(f);

        const t = new Room.Terrain(f.pos.roomName);

        const cm = man.getMatrix([f.self]);

        addMemStruct(mem, STRUCTURE_RAMPART, 3, f.pos.xy);
        const ramps = [f.pos];

        for (let dx = 1; dx < 50; dx++) {
            const [x, y] = [f.pos.x + dx, f.pos.y];
            if (t.get(x, y) & TERRAIN_MASK_WALL) break;
            if (x < 1 || x > 48) break;
            cm.set(x, y, 100);
            if (nearWall(t, x, y) || ((f.pos.x % 2) === (x % 2) && (f.pos.y % 2 === y % 2))) {
                addMemStruct(mem, STRUCTURE_RAMPART, 3, coordsToXY(x, y));
                ramps.push(new RoomPosition(x, y, f.pos.roomName));
            } else {
                addMemStruct(mem, STRUCTURE_WALL, 3, coordsToXY(x, y));
            }
        }

        const roadWeight = Math.floor(kPathRoad / 2);

        const roads = [];
        const ret = man.path(cm, f.pos, [{ pos: spos, range: 1 }]);
        const dpos = _.find(ret.path, p => p.getRangeTo(f) > 2)!;
        for (let dx = 1; dx < 50; dx++) {
            const [x, y] = [dpos.x + dx, dpos.y];
            if (t.get(x, y) & TERRAIN_MASK_WALL) break;
            if (x < 1 || x > 48) break;
            addMemStruct(mem, STRUCTURE_ROAD, 3, coordsToXY(x, y));
            roads.push(new RoomPosition(x, y, f.pos.roomName));
            cm.set(x, y, roadWeight);
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

    maxHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        if (stype === STRUCTURE_RAMPART && _.contains(this.mem.onramps!, xy)) {
            return this.calcRampWallHits(stype, xy) / 10 + (9 * MAXHITS.Mega / 10);
        }

        return this.calcRampWallHits(stype, xy) || this.calcStructHits(stype, xy);
    }

    dests(): [number, number][] {
        return [[this.mem.xy, 0]];
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

    maxHits(stype: BuildableStructureConstant, xy: number): MAXHITS {
        if (this.skip) return MAXHITS.Unknown;
        if (this.calcRampWallHits(stype, xy)) {
            const blast = this.mem.blast[xy] || 0;
            if (blast) {
                return blast + 1 + MAXHITS.Mega;
            }
            this.skip = true;
            const baseHits = this.manager.maxHitsInner(stype, xy);
            this.skip = false;

            if (baseHits > MAXHITS.Mega) {
                return Math.floor(baseHits - MAXHITS.Mega / 2) + MAXHITS.Mega;
            }
            return baseHits;
        }
        return this.calcStructHits(stype, xy);
    }

    draw(v: RoomVisual) {
        for (let xy in this.mem.blast) {
            const [x, y] = coordsFromXY(parseInt(xy));
            //v.circle(x, y, {fill: 'red'});
            v.text("" + (this.mem.blast[xy] / 1000000), x, y);
        }
    }
}