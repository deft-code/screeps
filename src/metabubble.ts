import { FlagExtra } from "flag";
import {
    MAXHITS, MetaStructure, MetaManager, MetaMem, PlanLevel, addMemStruct, cleanMem, registerMeta,
} from "metastruct";
import { kOrigin } from "metatraffic";
import { describeEntrance, edgeRange, entranceMiddle, entranceTiles, roomEntrances, roomExitTiles } from "entrances";
import { fromXY } from "Rewalker";

// The bubble: a rampart shell around the whole base, planned from a
// `bubble_<genesis>` child flag (anywhere in the room; its tile means
// nothing). It covers every structure the room's other metas plan, roads
// and ramparts aside:
//
//  1. A structure 2 or 3 tiles from the room edge and within kReach of an
//     exit tile has no room for a shell in front of it: it gets a rampart of
//     its own (kRampartLevel) and leaves the list.
//  2. So does one 4 or 5 tiles from the edge within kReach of a tile one
//     step in from an exit.
//  3. The shell: from the middle exit tile of each entrance (entrances.ts),
//     one PathFinder search to within kReach of any structure left, every
//     structure and exit tile impassable, the earlier shell tiles too. The
//     tile the path ends on gets a rampart (kRampartLevel) with a road under
//     it (kRoadLevel) and becomes impassable; repeated until no complete
//     path remains, then the next entrance.
//  4. The gates: a path from the traffic origin (the storage, else the
//     genesis flag) to each entrance; where it first crosses phase 3's ring
//     (never an earlier gate), the kGateDepth path tiles before the crossing
//     get shell ramparts (road under), and the last of them a traffic entry
//     from the origin (rcl kRoadLevel), so the base's road to that exit runs
//     through the gate. Entrances the ring already seals share its gates.
//
// Planning takes many searches, so it is a generator (planner) that yields
// after each one; resume() drives it kPlanCpu CPU a tick from every
// runGenesis pass, over as many ticks as it takes. The child flag's secondary
// colour is the state: a plan starts only from GREY (plan(), on a YELLOW or
// BLUE genesis pass), turns the flag WHITE while it runs, and runs only while
// WHITE (any other colour drops it); done, the flag goes back to GREY and the
// finished meta saves itself (setMeta + save), since GREEN cannot be timed to
// the tick it finishes. The generator lives on the heap: a push while WHITE
// starts the plan over. check() ignores the flag's tile and colour, so only
// BLUE replans a saved bubble. Nothing marks the shell "complete" beyond
// that: the ramparts are built from kRampartLevel, the roads from kRoadLevel,
// through the ordinary upkeep.
const kRampartLevel: PlanLevel = 5;
const kRoadLevel: PlanLevel = 7;
// How far from a structure a shell tile stands, and how close to an exit a
// structure must be to get its own rampart instead.
const kReach = 3;
// Shell tiles added behind a crossing, the last with the traffic entry.
const kGateDepth = 2;
// CPU a tick the planner may spend, and a search's op budget.
const kPlanCpu = 1;
const kMaxOps = 4000;
// Shell tiles at most; a plan that hits it is logged and kept.
const kMaxShell = 400;

type Planner = Generator<string, MetaMem | null, void>;

interface Planning {
    gen: Planner
    mem: MetaMem
    since: number
    // The generator's last status, for the log.
    status: string
}

const planners = new Map<string, Planning>();

function within(pos: RoomPosition, tiles: RoomPosition[], range: number): boolean {
    return _.any(tiles, t => t.getRangeTo(pos) <= range);
}

function inRoom(x: number, y: number): boolean {
    return x >= 1 && x <= 48 && y >= 1 && y <= 48;
}

// The walkable tiles one step inside the room from the exit tiles.
function innerTiles(exits: RoomPosition[], roomName: string): RoomPosition[] {
    const t = Game.map.getRoomTerrain(roomName);
    const seen = new Set<number>();
    const out: RoomPosition[] = [];
    for (const e of exits) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = e.x + dx;
                const y = e.y + dy;
                if (!inRoom(x, y) || t.get(x, y) & TERRAIN_MASK_WALL) continue;
                const xy = x * 100 + y;
                if (seen.has(xy)) continue;
                seen.add(xy);
                out.push(new RoomPosition(x, y, roomName));
            }
        }
    }
    return out;
}

function search(from: RoomPosition, goals: { pos: RoomPosition, range: number }[], cm: CostMatrix, roomName: string): PathFinderPath {
    return PathFinder.search(from, goals, {
        plainCost: 1,
        swampCost: 1,
        maxRooms: 1,
        maxOps: kMaxOps,
        roomCallback: name => name === roomName ? cm : false,
    });
}

function* planner(f: FlagExtra, man: MetaManager, mem: MetaMem): Planner {
    const roomName = f.pos.roomName;
    const entrances = roomEntrances(roomName);
    const exits = roomExitTiles(roomName);

    // Every structure another meta plans, at any level, roads and ramparts aside.
    const all = new Map<number, RoomPosition>();
    for (const meta of man.metas) {
        if (meta.name === mem.name) continue;
        _.forEach(meta.mem.structs, (lvls, stype) => {
            if (stype === STRUCTURE_ROAD || stype === STRUCTURE_RAMPART) return;
            _.forEach(lvls!, xys => _.forEach(xys!, xy => all.set(xy, fromXY(xy, roomName))));
        });
    }
    if (!all.size) {
        f.log("bubble: no planned structures to shield");
        return null;
    }
    const left = new Map(all);
    const shell = new Set<number>();
    const addShell = (pos: RoomPosition) => {
        shell.add(pos.xy);
        addMemStruct(mem, STRUCTURE_RAMPART, kRampartLevel, pos.xy);
        addMemStruct(mem, STRUCTURE_ROAD, kRoadLevel, pos.xy);
    };

    // 1 and 2: structures too close to an exit for a shell get their own rampart.
    let own = 0;
    const inner = innerTiles(exits, roomName);
    for (const [xy, pos] of [...left]) {
        const er = edgeRange(pos);
        const close = er <= 3 && within(pos, exits, kReach)
            || (er === 4 || er === 5) && within(pos, inner, kReach);
        if (!close) continue;
        addMemStruct(mem, STRUCTURE_RAMPART, kRampartLevel, xy);
        left.delete(xy);
        own++;
    }
    yield `edge: ${own} structures ramparted, ${left.size} to shield`;

    // 3: the shell, entrance by entrance.
    const cm = new PathFinder.CostMatrix();
    for (const pos of all.values()) cm.set(pos.x, pos.y, 0xFF);
    for (const e of exits) cm.set(e.x, e.y, 0xFF);
    const goals = [...left.values()].map(pos => ({ pos, range: kReach }));
    if (goals.length) {
        for (const e of entrances) {
            const origin = entranceMiddle(e, roomName);
            cm.set(origin.x, origin.y, 1);
            let n = 0;
            while (shell.size < kMaxShell) {
                const ret = search(origin, goals, cm, roomName);
                if (ret.incomplete) {
                    // Out of ops is not "sealed": say so, since the loop
                    // ends the same way either way.
                    if (ret.ops >= kMaxOps) f.log(`bubble: ${describeEntrance(e)} search out of ops after ${n} ramparts`);
                    break;
                }
                if (!ret.path.length) break;
                const end = _.last(ret.path);
                cm.set(end.x, end.y, 0xFF);
                addShell(end);
                n++;
                yield `shell ${describeEntrance(e)}: ${n} (${shell.size} in all)`;
            }
            cm.set(origin.x, origin.y, 0xFF);
            f.log(`bubble: ${describeEntrance(e)} sealed with ${n} ramparts`);
        }
        if (shell.size >= kMaxShell) f.log("bubble: shell capped at", kMaxShell, "tiles");
    }

    // 4: the gates, where the road from the origin to each entrance crosses the shell.
    const originXy = man.trafficOrigin();
    if (originXy === null) {
        f.log("bubble: no storage or genesis flag in the room, no gates");
    } else if (shell.size) {
        const from = fromXY(originXy, roomName);
        const gm = new PathFinder.CostMatrix();
        for (const pos of all.values()) gm.set(pos.x, pos.y, 0xFF);
        // The crossing is where a path meets phase 3's ring, never a gate
        // tile laid for an earlier entrance: the first plan of W3N4 chained
        // the gates of three entrances inward behind one another (7 Nov 2026).
        const ring = new Set(shell);
        mem.traffic = [];
        for (const e of entrances) {
            const ret = search(from, entranceTiles(e, roomName).map(pos => ({ pos, range: 0 })), gm, roomName);
            const path = [from, ...ret.path];
            const cross = _.findIndex(path, p => ring.has(p.xy));
            if (ret.incomplete || cross < 0) {
                f.log(`bubble: no road to ${describeEntrance(e)} crosses the shell`);
                yield `gate ${describeEntrance(e)}: none`;
                continue;
            }
            let gate: RoomPosition | null = null;
            for (let k = 1; k <= kGateDepth; k++) {
                const g = path[cross - k];
                if (!g || g.isEqualTo(from) || all.has(g.xy)) break;
                if (!shell.has(g.xy)) addShell(g);
                gate = g;
            }
            if (gate) mem.traffic.push({ src: kOrigin, dest: gate.xy, range: 0, rcl: +kRoadLevel, swamp: +kRoadLevel });
            yield `gate ${describeEntrance(e)}: ${gate ? gate.x + "," + gate.y : "none"}`;
        }
    }

    cleanMem(mem);
    return mem;
}

@registerMeta
export class Meta_bubble extends MetaStructure {
    // A YELLOW or BLUE genesis pass: start planning, from GREY only (see the
    // header). Nothing is returned now; resume() delivers the plan.
    static plan(f: FlagExtra, man: MetaManager): MetaStructure | null {
        if (f.secondaryColor !== COLOR_GREY) {
            f.log("bubble: plans only from a GREY flag, not", f.secondaryColor);
            return null;
        }
        Meta_bubble.start(f, man);
        return null;
    }

    static start(f: FlagExtra, man: MetaManager) {
        const mem = MetaStructure.makeMem(f);
        mem.color = COLOR_GREY;
        planners.set(f.name, { gen: planner(f, man, mem), mem, since: Game.time, status: "" });
        f.setColor(f.color, COLOR_WHITE);
        f.log("bubble: planning");
    }

    // Every runGenesis pass: a kPlanCpu slice of the plan while the flag is
    // WHITE; done, the meta is saved and the flag goes GREY.
    static resume(f: FlagExtra, man: MetaManager) {
        let p = planners.get(f.name);
        if (f.secondaryColor !== COLOR_WHITE) {
            if (p) {
                planners.delete(f.name);
                f.log("bubble: planning dropped, the flag is no longer WHITE");
            }
            return;
        }
        if (!p) {
            f.log("bubble: planning over after a reset");
            Meta_bubble.start(f, man);
            p = planners.get(f.name)!;
        }
        const t0 = Game.cpu.getUsed();
        let r = p.gen.next();
        while (!r.done && Game.cpu.getUsed() - t0 < kPlanCpu) {
            p.status = r.value;
            r = p.gen.next();
        }
        if (!r.done) {
            p.status = r.value;
            new Meta_bubble(p.mem, man).draw(new RoomVisual(f.pos.roomName));
            return;
        }
        planners.delete(f.name);
        f.setColor(f.color, COLOR_GREY);
        const mem = r.value;
        if (!mem) return;
        const meta = new Meta_bubble(mem, man);
        f.log(`bubble: planned in ${Game.time - p.since} ticks: ${meta.getSites(STRUCTURE_RAMPART).length} ramparts,`,
            `${meta.getSites(STRUCTURE_ROAD).length} roads, ${mem.traffic?.length || 0} gates; saving`);
        man.setMeta(meta);
        man.save();
    }

    // What a planning flag is doing, for the console.
    static status(flagName: string): string {
        const p = planners.get(flagName);
        return p ? `planning since ${p.since}: ${p.status}` : "idle";
    }

    // The flag's tile and colour mean nothing to the plan (the colour is the
    // planning state), so only BLUE replans.
    check(f: Flag): boolean {
        return f.self === this.mem.name;
    }

    maxHits(stype: BuildableStructureConstant, xy: number, rcl: number): MAXHITS {
        return this.calcRampWallHits(stype, xy, rcl) || this.calcStructHits(stype, xy, rcl);
    }
}
