import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Bulldozer, dozeable, dozeableStruct, kDozerBoost } from "job.bulldozer";
import { coordsFromXY, fromXY, toXY } from "Rewalker";

// Flags named like this (any case) in the mission room mark tiles to clear.
const kFlagPrefix = "bulldoze";
// Ticks between breach plans; a new first target replans at once.
const kPlanPace = 100;
// PathFinder limits for the breach plan.
const kMaxOps = 20000;
const kMaxRooms = 16;
// Matrix cost of a tile: round(log10(hits) * kHitsScale) of what blocks it.
const kHitsScale = 20;

type Target = [number, string];

// Tear a way into a room: "Bulldoze <target> <home>".
//
//   scheduleService('Bulldoze W4N3 W3N4')
//
// The mission keeps a list of tiles to clear (memory.doze, [xy, room]); the
// first is the destination. Every tick:
//
//   1. Flags in the mission room whose name starts with "bulldoze": a tile not
//      yet listed is appended; then every such flag standing on a listed tile
//      moves that tile to the front and is removed. So a flag means "this
//      next", and the flag itself never lasts a tick.
//   2. Tiles we can see with nothing dozeable left on them are dropped.
//   3. Every kPlanPace ticks, and whenever the destination changes, plan the
//      breach: a path from the first spawn of the home room to the
//      destination where plains and swamp cost the same, terrain walls stay
//      impassable, and a tile blocked by structures costs
//      round(log10(hits) * 20) (roads, containers and our own ramparts are
//      free; our other structures and anything without hits are impassable).
//      Every tile of that path holding a non-walkable structure that is not
//      ours is appended to the list. Rooms without vision plan as open ground.
//   4. Draw a spot marker on every tile, an extra circle round the first, and
//      the planned breach.
//
// One Bulldozer (job.bulldozer.ts) while the list is not empty; the mission
// idles, waiting for flags, when it is. While a dozer is an egg or spawning
// the home labs are asked for XZH2O so the Chemist has the lab loaded in time.
@register
export class Bulldoze extends Mission {
    // Heap only: rebuilt by the next plan after a global reset.
    planned = 0;
    plannedFor = "";
    breach: RoomPosition[] = [];

    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.args[2];
        return super.getRoomName(alias);
    }

    get list(): Target[] {
        return this.memory.doze = this.memory.doze || [];
    }

    // Read by Bulldozer.
    dozePositions(): RoomPosition[] {
        return this.list.map(([xy, room]) => fromXY(xy, room));
    }

    has(pos: RoomPosition): boolean {
        return _.any(this.list, t => t[0] === toXY(pos) && t[1] === pos.roomName);
    }

    add(pos: RoomPosition): boolean {
        if (this.has(pos)) return false;
        this.list.push([toXY(pos), pos.roomName]);
        return true;
    }

    doFlags() {
        const flags = _.filter(Game.flags, f =>
            f.pos.roomName === this.roomName && f.name.toLowerCase().startsWith(kFlagPrefix));
        for (const f of flags) {
            if (this.add(f.pos)) debug.log(this.name, "flag", f.name, "adds", f.pos);
            if (Game.rooms[f.pos.roomName] && !dozeable(f.pos).length) {
                debug.log(this.name, "flag", f.name, "at", f.pos, "has nothing to dismantle under it, dropping the tile");
            }
        }
        for (const f of flags) {
            const [hit] = _.remove(this.list, t => t[0] === toXY(f.pos) && t[1] === f.pos.roomName);
            if (!hit) continue;
            this.list.unshift(hit);
            f.remove();
        }
    }

    prune() {
        const gone = _.remove(this.list, ([xy, room]) =>
            Game.rooms[room] && !dozeable(fromXY(xy, room)).length);
        if (gone.length) debug.log(this.name, "cleared", JSON.stringify(gone), "left", this.list.length);
    }

    // Blocking hits per tile -> cost. undefined for rooms we cannot see.
    matrix(roomName: string): CostMatrix | undefined {
        const room = Game.rooms[roomName];
        if (!room) return undefined;
        const mat = new PathFinder.CostMatrix();
        const hits: { [xy: number]: number } = {};
        for (const s of room.find(FIND_STRUCTURES)) {
            if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) continue;
            if (s.structureType === STRUCTURE_RAMPART && ((s as StructureRampart).my || (s as StructureRampart).isPublic)) continue;
            const xy = toXY(s.pos);
            hits[xy] = dozeableStruct(s) ? (hits[xy] || 0) + s.hits : Infinity;
        }
        _.forEach(hits, (h, key) => {
            const [x, y] = coordsFromXY(Number(key));
            const cost = h === Infinity ? 0xff : Math.round(Math.log10(h) * kHitsScale);
            mat.set(x, y, Math.max(1, Math.min(0xfe, cost)));
        });
        return mat;
    }

    plan() {
        const first = _.first(this.list);
        if (!first) return;
        const key = JSON.stringify(first);
        if (key === this.plannedFor && Game.time < this.planned + kPlanPace) return;

        const home = this.getRoom("home");
        const spawn = home && _.first(home.findStructs(STRUCTURE_SPAWN));
        if (!spawn) {
            debug.log(this.name, "no spawn in home room", this.getRoomName("home"));
            return;
        }
        this.planned = Game.time;
        this.plannedFor = key;

        const mats: { [room: string]: CostMatrix | undefined } = {};
        const ret = PathFinder.search(spawn.pos, { pos: fromXY(first[0], first[1]), range: 1 }, {
            plainCost: 1,
            swampCost: 1,
            maxOps: kMaxOps,
            maxRooms: kMaxRooms,
            roomCallback: name => {
                if (!(name in mats)) mats[name] = this.matrix(name);
                return mats[name] || new PathFinder.CostMatrix();
            },
        });
        this.breach = ret.path;
        if (ret.incomplete) debug.log(this.name, "breach plan incomplete: ops", ret.ops, "steps", ret.path.length);

        const added = _.filter(ret.path, pos => this.blocked(pos) && this.add(pos));
        if (added.length) debug.log(this.name, "breach adds", added.length, "tiles:", added.join(" "));
    }

    // Does something of somebody else's stand in the way on this tile?
    blocked(pos: RoomPosition): boolean {
        return _.any(dozeable(pos), s =>
            s.structureType === STRUCTURE_RAMPART ? !(s as StructureRampart).isPublic :
                _.contains(OBSTACLE_OBJECT_TYPES, s.structureType));
    }

    draw() {
        this.list.forEach(([xy, room], i) => {
            const [x, y] = coordsFromXY(xy);
            const v = new RoomVisual(room);
            v.animatedPosition(x, y);
            if (i === 0) v.circle(x, y, { radius: 0.9, fill: "", stroke: "red", strokeWidth: 0.1, opacity: 0.8 });
        });
        _.forEach(_.groupBy(this.breach, p => p.roomName), (path, room) =>
            new RoomVisual(room).poly(path, { stroke: "red", lineStyle: "dashed", opacity: 0.4 }));
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        this.doFlags();
        this.prune();
        this.plan();
        this.draw();

        if (this.list.length) this.nJobs(Bulldozer, 1);

        const role = Bulldozer.name.toLowerCase();
        if (this.hasEgg(role) || this.roleHatches(role).length) {
            this.getRoom("home")?.requestBoost(kDozerBoost);
        }

        super.run();
        return "normal";
    }

    status(): string {
        const first = _.first(this.list);
        return super.status() + ` targets:${this.list.length}` + (first ? ` first:${first[1]}:${first[0]}` : "");
    }
}
