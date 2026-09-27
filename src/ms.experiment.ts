import { register, Priority, Service } from "process";
import * as debug from "debug";
import { Path, MemPath } from "Rewalker";
import { RoadPlanner, RoadWeights, kRoadWeights } from "roadplan";
import { FlagExtra } from "flag";

// Road weight experiment for the planners (roadplan.ts, metatraffic.ts).
// Runs from a purple flag named "Experiment" (service.flag.ts) and looks
// for its child flag "dest_Experiment": the purple flag is the path's
// start, the child its end. It searches one path per weight set in kWeights
// on a RoadPlanner of its own weights, the same helper the live planners
// use, and draws each path every tick in its colour, widest first so the
// overlaps stay visible. The plans are kept in Memory.experiment and redone
// when either flag moves, every kReplanPace ticks, or by
// getService('Experiment').replan(). status() prints each set's cost, ops
// and tile counts by terrain.
//
// The settled weights (metatraffic.ts kPathRoad/Plain/Swamp) came out of
// this in Sept 2026: road:plain:swamp = 2:3:6.
//
// Console:
//   createFlagAt('W26S8', 20, 20, 'Experiment', COLOR_PURPLE, COLOR_PURPLE)
//   createFlagAt('W29S5', 31, 33, 'dest_Experiment', COLOR_GREY, COLOR_GREY)
//   getService('Experiment').status()
//   getService('Experiment').replan()

interface Weights {
    name: string
    road: number
    plain: number
    swamp: number
    color: string
    width: number
}

// [road, plain, swamp] per set. The plain:swamp ratio is what decides how
// far a path detours around swamp; the road discount how hard it is pulled
// onto existing and planned roads. The first set is the live one.
export const kWeights: Weights[] = [
    { name: "live", road: kRoadWeights.road, plain: kRoadWeights.plain, swamp: kRoadWeights.swamp, color: "yellow", width: 0.4 },
    { name: "high", road: 2, plain: 3, swamp: 6, color: "cyan", width: 0.25 },
    { name: "mid", road: 1, plain: 1, swamp: 1, color: "magenta", width: 0.12 },
    { name: "red", road: 2, plain: 3, swamp: 12, color: "red", width: 0.06 },
];

// The aversions of a set, as multiples of its swamp weight (the live
// values in metatraffic.ts are the same multiples).
const kNearRatio = 2;
const kLairRatio = 5;
// Replan this often even when nothing moved (structures come and go).
const kReplanPace = 1000;
const kMaxOps = 100000;
const kLogPace = 100;

interface Result {
    name: string
    path: MemPath
    cost: number
    ops: number
    incomplete: boolean
    rooms: string[]
    road: number
    plain: number
    swamp: number
}

interface ExperimentMem {
    key: string
    at: number
    results: Result[]
}

declare global {
    interface Memory {
        experiment?: ExperimentMem
    }
}

function roadWeights(w: Weights): RoadWeights {
    return { road: w.road, plain: w.plain, swamp: w.swamp, near: kNearRatio * w.swamp, lair: kLairRatio * w.swamp };
}

@register
export class Experiment extends Service {
    get flag(): FlagExtra | undefined {
        return Game.flags[this.name] as FlagExtra | undefined;
    }

    get dest(): FlagExtra | undefined {
        return this.flag?.getChild("dest") || undefined;
    }

    get memory(): ExperimentMem | undefined {
        return Memory.experiment;
    }

    run(): Priority {
        const flag = this.flag;
        const dest = this.dest;
        if (!flag || !dest) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "needs flags Experiment and dest_Experiment");
            return "low";
        }
        const key = `${flag.pos}>${dest.pos}`;
        const mem = this.memory;
        if (!mem || mem.key !== key || Game.time - mem.at >= kReplanPace) this.plan(flag.pos, dest.pos, key);
        this.draw();
        return "low";
    }

    replan() {
        const flag = this.flag, dest = this.dest;
        if (!flag || !dest) return "no flags";
        this.plan(flag.pos, dest.pos, `${flag.pos}>${dest.pos}`);
        return this.status();
    }

    plan(from: RoomPosition, to: RoomPosition, key: string) {
        const results: Result[] = [];
        for (const w of kWeights) {
            const planner = new RoadPlanner(roadWeights(w));
            if (!planner.route(from.roomName, to.roomName)) {
                debug.log(this.name, "no room route", from, "->", to);
                break;
            }
            const ret = planner.search(from, [{ pos: to, range: 1 }], { maxOps: kMaxOps });
            if (!ret.path.length) {
                debug.log(this.name, w.name, "found no path", from, "->", to, "ops", ret.ops);
                continue;
            }
            const counts = { road: 0, plain: 0, swamp: 0 };
            for (const p of ret.path) {
                const mat = planner.mats.get(p.roomName);
                const onRoad = mat && mat.get(p.x, p.y) === w.road;
                const swamp = Game.map.getRoomTerrain(p.roomName).get(p.x, p.y) & TERRAIN_MASK_SWAMP;
                if (onRoad) counts.road++;
                else if (swamp) counts.swamp++;
                else counts.plain++;
            }
            results.push({
                name: w.name,
                path: new Path([from, ...ret.path]).serialize(),
                cost: ret.cost,
                ops: ret.ops,
                incomplete: ret.incomplete,
                rooms: _.uniq(ret.path.map(p => p.roomName)),
                ...counts,
            });
        }
        Memory.experiment = { key, at: Game.time, results };
        debug.log(this.name, "planned", key, "\n" + this.status());
    }

    draw() {
        const mem = this.memory;
        if (!mem) return;
        for (const w of kWeights) {
            const r = _.find(mem.results, r => r.name === w.name);
            if (!r) continue;
            const style: PolyStyle = { stroke: w.color, lineStyle: "dashed", strokeWidth: w.width, opacity: 0.6 };
            Path.deserialize(r.path).draw(style);
        }
    }

    status(): string {
        const mem = this.memory;
        const lines = [super.status()];
        if (!mem) return lines.concat("no plan yet").join("\n");
        lines.push(`${mem.key} at ${mem.at}`);
        for (const w of kWeights) {
            const r = _.find(mem.results, r => r.name === w.name);
            if (!r) {
                lines.push(`${w.name} (${w.color}) ${w.road}/${w.plain}/${w.swamp}: no path`);
                continue;
            }
            const len = r.road + r.plain + r.swamp;
            lines.push(`${w.name} (${w.color}) ${w.road}/${w.plain}/${w.swamp}: ${len} tiles` +
                ` road:${r.road} plain:${r.plain} swamp:${r.swamp} cost:${r.cost} ops:${r.ops}` +
                `${r.incomplete ? " INCOMPLETE" : ""} via ${r.rooms.join(">")}`);
        }
        return lines.join("\n");
    }
}
