import { FlagExtra } from "flag";
import { merge } from "lib";
import { coordsToXY, coordsFromXY, toXY, fromXY, Goal } from "Rewalker";
import { log } from "debug";
import { canRun } from "shed";

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
}

function calcRole(name: string): string {
    return _.words(name)[0].toLowerCase();
}

function calcSelf(name: string): string {
    const i = name.indexOf('_');
    if (i < 0) return name;
    return name.substring(0, i);
}

function calcParent(name: string): string | null {
    const i = name.indexOf('_');
    if (i < 0) return null;
    return name.substring(i + 1);
}

const kPathRoad = 7;
const kPathPlain = 11;
const kPathSwamp = 12;

// function mergePrototypes(klassProto: any, extraProto: any) {
//         const descs = Object.getOwnPropertyDescriptors(extraProto);
//         delete descs.constructor;
//         Object.defineProperties(klassProto, descs);
// }

// function merge(klass: any, extra: any) {
//     mergePrototypes(klass.prototype, extra.prototype);
// }

// function injecter(klass: any) {
//     return function (extra: any) {
//         merge(klass, extra);
//     }
// }

// function extender(extra: any) {
//     mergePrototypes(Object.getPrototypeOf(extra.prototype), extra.prototype);
// }

class RoomMetaExtra extends Room {
    get meta(): MetaManager {
        if (!this.cache.meta) {
            return this.cache.meta = new MetaManager(this.name);
        }
        return this.cache.meta;
    }
}
merge(Room, RoomMetaExtra);


class MetaPlan extends FlagExtra {
    runMeta() {
        if (!this.parent) {
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

function runGenesis(f: MetaPlan) {
    //man.save();
    const man = f.room!.meta;
    const v = new RoomVisual(man.name);
    _.forEach(man.metas, meta => meta.draw(v));
    man.run();
}

function bad_runGenesis(f: MetaPlan) {
    const srcs = _.sortBy(f.room!.find(FIND_SOURCES), s => s.id);
    const asrc = 'asrc_' + f.name;
    const bsrc = 'bsrc_' + f.name;
    if (srcs.length > 0 && !Game.flags[asrc]) {
        const ret = srcs[0].pos.createFlag(asrc, COLOR_CYAN, COLOR_CYAN);
        f.log("created asrc", ret);
    }
    if (srcs.length > 1 && !Game.flags[bsrc]) {
        const ret = srcs[1].pos.createFlag(bsrc, COLOR_CYAN, COLOR_CYAN);
        f.log("created bsrc", ret);
    }
}

type PlanLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type legend = {
    [tile: string]: [PlanLevel, BuildableStructureConstant]
}

function rotate(x: number, y: number, color: ColorConstant): [number, number] {
    switch (color) {
        case COLOR_RED: return [-x, y];
        case COLOR_ORANGE: return [x, -y];
        case COLOR_BROWN: return [-y, x];
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
                console.log("BAD TEMPLATE", ix, iy, tile)
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

declare global {
    interface RoomMemory {
        meta?: {
            metas: MetaMem[]
        }
    }
}

interface MetaMem {
    name: string
    color: ColorConstant
    priority?: number
    xy: number
    points: MetaPoints
    structs: MetaStructs
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

class MetaManager {
    metas: MetaStructure[]
    birth = 0
    begin = 0
    constructor(readonly name: string) {
        const metaMem = this.memory;
        this.metas = _.compact(_.map(metaMem.metas, mem => newMeta(mem, this))) as MetaStructure[];
        this.birth = Game.time
        this.begin = 10 + _.random(50);
    }

    get memory(): { metas: MetaMem[] } {
        let roomMem = Memory.rooms[this.name];
        if (!roomMem) {
            roomMem = Memory.rooms[this.name] = {};
        }
        let metaMem = roomMem.meta;
        if (!metaMem) {
            return roomMem.meta = {
                metas: []
            }
        }
        return metaMem;
    }

    save() {
        const metaMem = this.memory;
        metaMem.metas = _.map(this.metas, meta => meta.mem);
    }

    run() {
        const room = Game.rooms[this.name];
        if (!room) return;

        if (Game.time < this.birth + this.begin) {
            Game.rooms[this.name].log("Anti-thrashing");
        }

        const nsites = room.find(FIND_MY_CONSTRUCTION_SITES).length
        if (nsites > 2) return;

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
            this.makeSite(STRUCTURE_RAMPART) ||
            this.makeSite(STRUCTURE_LINK) ||
            this.makeSite(STRUCTURE_EXTRACTOR) ||
            this.makeSite(STRUCTURE_ROAD) ||
            this.makeSite(STRUCTURE_LAB) ||
            this.makeSite(STRUCTURE_OBSERVER) ||
            this.makeSite(STRUCTURE_NUKER) ||
            this.makeSite(STRUCTURE_POWER_SPAWN);
    }

    getMeta(name: string): MetaStructure | null {
        return _.find(this.metas, meta => meta.name === name) || null;
    }

    setMeta(meta: MetaStructure) {
        _.remove(this.metas, m => m.name === meta.name);
        this.metas.push(meta);
        this.metas.sort((l, r) => l.priority - r.priority);
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

    getMatrix() {
        const cm = new PathFinder.CostMatrix();
        for (const meta of this.metas) {
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

    makeSite(stype: BuildableStructureConstant): boolean {
        const room = Game.rooms[this.name];
        if (!room) return false;
        let blocker: blocker = null;
        for (const meta of this.metas) {
            const [free, newblocker] = meta.findSite(stype, room);
            if (free) {
                const ret = free.createConstructionSite(stype);
                if (ret === OK) return true;
                if (ret === ERR_RCL_NOT_ENOUGH) return this.purge();
                room.errlog(ret, "Failed to create site", stype);
            }
            if (!blocker) {
                blocker = newblocker;
            }
        }

        if (blocker) {
            room.log("SITE BLOCKED", stype, blocker);
            room.visual.animatedPosition(blocker.pos.x, blocker.pos.y);
        }

        blocker = null;
        for (const meta of this.metas) {
            const [free, newblocker] = meta.findOptional(stype, room);
            if (free) {
                const ret = free.createConstructionSite(stype);
                if (ret === OK) return true;
                if (ret === ERR_RCL_NOT_ENOUGH) return this.purge();
                room.errlog(ret, "Failed to create site", stype);
            }
            if (!blocker) {
                blocker = newblocker;
            }
        }
        if (blocker) {
            room.log("OPTIONAL SITE BLOCKED", stype, blocker);
            room.visual.animatedPosition(blocker.pos.x, blocker.pos.y);
        }

        return false;
    }

    purge(): boolean {
        return false;
    }
}

function roomLevel(room: Room): PlanLevel {
    if (!room.controller) return 0;
    if (!room.controller.my) return 0;
    return room.controller.level as PlanLevel;
}

class MetaStructure {
    constructor(public mem: MetaMem, readonly manager: MetaManager) {
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
}

function checkSitePos(pos: RoomPosition, stype: BuildableStructureConstant): [RoomPosition | null, Structure | ConstructionSite | null] {
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    for (const site of sites) {
        if (!site.my) {
            return [null, site];
        }
        if (site.structureType === stype || site.structureType === STRUCTURE_RAMPART) {
            return [null, null];
        }
        return [null, site];
    }

    const structs = pos.lookFor(LOOK_STRUCTURES) as Structure[];
    for (const struct of structs) {
        if ((<OwnedStructure>struct).my === false) {
            return [null, struct];
        }
        // it's mine and the correct type
        if (struct.structureType === stype) return [null, null];

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
            b: [5, STRUCTURE_TOWER],
            c: [7, STRUCTURE_TOWER],
            d: [8, STRUCTURE_TOWER],
            S: [4, STRUCTURE_STORAGE],
            l: [5, STRUCTURE_LINK],
            T: [6, STRUCTURE_TERMINAL],
            r: [3, STRUCTURE_ROAD],
            p: [8, STRUCTURE_POWER_SPAWN],
        }
        const layout = `
            rSsd.
            a0l1d
            bcTdp`;
        const points = ['hub', 'shovel'];
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, points, layout);
        return new this(mem, man);
    }
    dests(): [number, number][] {
        const s = this.getSite(STRUCTURE_STORAGE)!;
        const t = this.getSite(STRUCTURE_TERMINAL)!;
        return [[s, 1], [t, 1]];
    }
}

@registerMeta
class Meta_cap extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const legend: legend = {
            a: [2, STRUCTURE_EXTENSION],
            b: [3, STRUCTURE_EXTENSION],
            c: [4, STRUCTURE_EXTENSION],
            l: [9, STRUCTURE_LINK],
            r: [3, STRUCTURE_ROAD],
        }
        const layout = `
            .bba.
            bbrar
            brl0a
            ccraa
            .ccc.`;
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, ['cap'], layout);
        return new this(mem, man);
    }
    dests(): [number, number][] {
        return this.pointDests();
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
        }
        const layout = `
            bcrbr
            crars
            rarcr
            brca.
            rsr.o`;
        const mem = MetaStructure.makeMem(f);
        makeTemplate(mem, legend, [], layout);
        return new this(mem, man);
    }
    dests(): [number, number][] {
        return [[this.mem.xy, 1]];
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

@registerMeta
class Meta_asrc extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const p = man.getSite(STRUCTURE_STORAGE);
        if (!p) return null;
        const cm = man.getMatrix();
        const ret = man.path(cm, f.pos, [{ pos: p, range: 1 }]);
        const v = new RoomVisual(man.name);
        for (const pos of ret.path) {
            v.circle(pos.x, pos.y);
        }
        const mem = MetaStructure.makeMem(f);
        addMemStruct(mem, STRUCTURE_LINK, 9, ret.path[1].xy);
        const meta = new this(mem, man);
        meta.myspot = ret.path[0].xy;
        return meta;
    }
    dests(): [number, number][] {
        return this.pointDests();
    }
}

@registerMeta
class Meta_bsrc extends Meta_asrc { }

@registerMeta
class Meta_min extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const mem = MetaStructure.makeMem(f);
        return new this(mem, man);
    }
    dests(): [number, number][] {
        return [[this.mem.xy, 1]];
    }
    draw(v: RoomVisual) {
        const [x, y] = coordsFromXY(this.mem.xy);
        v.structure(x, y, STRUCTURE_CONTAINER, { opacity: 0.5 });
    }
}

@registerMeta
class Meta_ctrl extends MetaStructure {
    static plan(f: Flag, man: MetaManager) {
        const p = man.getSite(STRUCTURE_STORAGE);
        if (!p) return null;
        const cm = man.getMatrix();
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
        const cm = man.getMatrix();
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
                if (cm.get(x, y) !== 0xFF) {
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