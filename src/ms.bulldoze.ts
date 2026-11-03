import { Mission, MissionMemory } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Bulldozer, dozeable, kDozerBoost } from "job.bulldozer";
import { coordsFromXY, fromXY, toXY } from "Rewalker";
import { createFlagAt, FlagExtra } from "flag";
import { theRadar } from "radar";
import { roomCenterPos } from "intel";
import { hitsMatrix } from "staging";

// Flags named like this (any case) in the mission room mark tiles to clear
// next (legacy; the mission's own child flags are the usual way).
const kFlagPrefix = "bulldoze";
// The mission flag: "Bulldoze" (BulldozeN when taken); its children are
// "doze<xy>_Bulldoze", one per listed tile.
const kFlagName = "Bulldoze";
const kChildPrefix = "doze";
// Ticks between breach plans; a new first target replans at once.
const kPlanPace = 100;
// PathFinder limits for the breach plan.
const kMaxOps = 20000;
const kMaxRooms = 16;
// Matrix cost of a tile: round(log10(hits) * 20) of what blocks it
// (staging.ts hitsMatrix, shared with the Assault breach since 1 Nov 2026).

type Target = [number, string];

interface BulldozeMemory extends MissionMemory {
    doze?: Target[]
    // Name of the mission flag (the anchor the breach is planned from).
    flag?: string
    // Where the anchor stands (packed xy in the target room); the room
    // centre until aim() is called.
    anchor?: number
    // Bulldozers kept alive (the `dozers` setter), default kDozers.
    dozers?: number
}

const kDozers = 1;

// Tear a way into a room: "Bulldoze <target> [home]". The home (also the
// spawn room: every dozer hatches there, Bulldozer.spawn through
// JobCreep.spawnRoomSpawns) is the second argument; without one the home
// is the target room and the dozers spawn from the spawns nearest it.
//
//   scheduleService('Bulldoze W18S5 W25S7')
//   getService('Bulldoze W18S5 W25S7').aim(48, 11)   // put the anchor flag here (default: the room centre)
//   getService('Bulldoze W18S5 W25S7').dozers = 2    // bulldozers kept alive (persisted; default 1)
//
// The mission keeps a list of tiles to clear (memory.doze, [xy, room]); the
// first is the destination. It owns a flag, "Bulldoze" (BulldozeN when
// taken; memory.flag), standing on the anchor (memory.anchor, aim()): the
// tile in the target room the breach is planned from, where the dozers
// come in. Every listed tile carries a child flag "doze<xy>_Bulldoze" so
// the plan shows on the map (syncChildren: made for listed tiles, removed
// with them). Every tick:
//
//   1. Flags: a child flag of ours on a tile not yet listed appends it (so
//      a target can be added by hand by placing one); a flag whose name
//      starts with "bulldoze" (legacy) appends its tile, moves it to the
//      front and is removed.
//   2. Tiles we can see with nothing dozeable left on them are dropped.
//   3. Every kPlanPace ticks, and whenever the destination changes, plan the
//      breach: a path from the anchor (the home room's first spawn without
//      a flag yet) to the destination where plains and swamp cost the
//      same, terrain walls stay impassable, and a tile blocked by
//      structures costs round(log10(hits) * 20) (roads, containers and our
//      own ramparts are free; our other structures and anything without
//      hits are impassable). Every tile of that path holding a non-walkable
//      structure that is not ours is appended to the list. Rooms without
//      vision plan as open ground, so the target room must be in view: while a plan is pending and the room is
//      out of sight the radar is asked to observe it now (planPending). With nothing listed and the target room
//      in view, the breach is planned to the room's nearest hostile spawn
//      (else its controller) and seeds the list (seed()).
//   4. Draw a spot marker on every tile, an extra circle round the first, and
//      the planned breach.
//
// `dozers` Bulldozers (job.bulldozer.ts, paceNJobs: one egg per
// 1500 / (dozers + 1) ticks while under the count, so a death is replaced
// at the next rate tick rather than the spawn kept busy) while the list is
// not empty; the mission idles, waiting for targets, when it is. While a dozer
// is an egg or spawning the home labs are asked for XZH2O so the Chemist
// has the lab loaded in time.
@register
export class Bulldoze extends Mission {
    // Heap only: rebuilt by the next plan after a global reset.
    planned = 0;
    plannedFor = "";
    breach: RoomPosition[] = [];

    get roomName() {
        return this.args[1];
    }

    get mem(): BulldozeMemory {
        return this.memory as BulldozeMemory;
    }

    // The second argument is both home and spawn room; none means the
    // target room (Mission.homeRoomName) and distance-picked spawns.
    getRoomName(alias = "") {
        if (alias === "home" || alias === "spawn") return this.args[2] || null;
        return super.getRoomName(alias);
    }

    get list(): Target[] {
        return this.mem.doze = this.mem.doze || [];
    }

    // Bulldozers kept alive; persisted.
    get dozers(): number {
        return this.mem.dozers ?? kDozers;
    }

    set dozers(n: number) {
        this.mem.dozers = Math.max(0, Math.floor(n));
        debug.log(this.name, "dozers:", this.mem.dozers);
    }

    // ---- flags ----

    get flag(): FlagExtra | null {
        const name = this.mem.flag;
        return name && (Game.flags[name] as FlagExtra) || null;
    }

    // Where the breach starts: the anchor flag, else memory.anchor, else
    // the room centre.
    get anchor(): RoomPosition {
        const flag = this.flag;
        if (flag && flag.pos.roomName === this.roomName) return flag.pos;
        const xy = this.mem.anchor;
        if (xy !== undefined) return fromXY(xy, this.roomName);
        return roomCenterPos(this.roomName);
    }

    // Console: put the anchor (and its flag) at x,y of the target room.
    aim(x: number, y: number): string {
        this.mem.anchor = x * 100 + y;
        const flag = this.flag;
        if (flag) flag.setPosition(fromXY(this.mem.anchor, this.roomName));
        this.plannedFor = "";
        return `anchor ${this.roomName} ${x},${y}`;
    }

    // "Bulldoze", else the first "BulldozeN" no flag or mission uses.
    pickFlagName(): string {
        const taken = (name: string) => !!Game.flags[name] ||
            _.any(Memory.missions, (m: BulldozeMemory, key) => key !== this.name && m.flag === name);
        if (!taken(kFlagName)) return kFlagName;
        for (let i = 2; ; i++) {
            const name = kFlagName + i;
            if (!taken(name)) return name;
        }
    }

    // The mission flag on the anchor, and a child flag on every listed
    // tile (and none elsewhere).
    placeFlags() {
        const mem = this.mem;
        if (!mem.flag) mem.flag = this.pickFlagName();
        const flag = this.flag;
        const anchor = this.anchor;
        if (!flag) {
            // The children wait a tick: makeChild wants a parent in Game.flags.
            debug.log(this.name, "flag", mem.flag, "at", anchor, createFlagAt(anchor.roomName, anchor.x, anchor.y, mem.flag, COLOR_RED, COLOR_RED));
            return;
        }
        if (!flag.pos.isEqualTo(anchor)) {
            debug.log(this.name, "flag", flag.name, "back from", flag.pos, "to", anchor, flag.setPosition(anchor));
        }
        this.syncChildren(flag);
    }

    childFlags(flag: FlagExtra): FlagExtra[] {
        return _.filter(Game.flags, f => (f as FlagExtra).parentName === flag.name) as FlagExtra[];
    }

    syncChildren(flag: FlagExtra) {
        const listed = new Set(this.list.map(([xy, room]) => room + xy));
        for (const f of this.childFlags(flag)) {
            if (!listed.has(f.pos.roomName + toXY(f.pos))) {
                debug.log(this.name, "dropping", f.name, "at", f.pos);
                f.remove();
            }
        }
        for (const [xy, room] of this.list) {
            const name = flag.childName(kChildPrefix + xy);
            if (Game.flags[name]) continue;
            const pos = fromXY(xy, room);
            debug.log(this.name, "child", name, "at", pos, flag.makeChild(kChildPrefix + xy, pos, COLOR_RED));
        }
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
        // Our own children: a hand-placed one on a new tile adds it.
        const flag = this.flag;
        if (flag) {
            for (const f of this.childFlags(flag)) {
                if (f.pos.roomName === this.roomName && this.add(f.pos)) debug.log(this.name, "child flag", f.name, "adds", f.pos);
            }
        }
        // Legacy "bulldoze*" flags: not our own flag ("Bulldoze" matches the
        // prefix too) nor its children.
        const own = this.mem.flag;
        const flags = _.filter(Game.flags, f =>
            f.pos.roomName === this.roomName && f.name.toLowerCase().startsWith(kFlagPrefix) &&
            f.name !== own && (f as FlagExtra).parentName !== own);
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
        return hitsMatrix(roomName);
    }

    // Where the breach is planned from: the anchor flag once it stands,
    // else the home room's first spawn, else null.
    origin(): RoomPosition | null {
        if (this.flag) return this.anchor;
        const home = this.getRoom("home");
        const spawn = home && _.first(home.findStructs(STRUCTURE_SPAWN));
        return spawn ? spawn.pos : null;
    }

    // Nothing listed: with the target room in view, breach toward its
    // nearest hostile spawn (else its controller) and list what blocks
    // the way.
    seed() {
        const room = this.room;
        if (!room) return;
        const origin = this.origin();
        if (!origin) return;
        const spawns = room.find(FIND_HOSTILE_SPAWNS);
        const goal = spawns.length ? origin.findClosestByRange(spawns) : room.controller;
        if (!goal) return;
        const added = this.breachTo(origin, goal.pos);
        if (added.length) debug.log(this.name, "seeded", added.length, "tiles toward", goal, ":", added.join(" "));
        else debug.log(this.name, "nothing blocks the way from", origin, "to", goal);
    }

    // A plan is wanted: nothing listed yet (seed), a new first target, or
    // the last plan is kPlanPace old. Out of sight the radar is asked to
    // look now (run()), so the plan is never made blind and never waits
    // on a passing creep.
    planPending(): boolean {
        const first = _.first(this.list);
        if (!first) return true;
        return JSON.stringify(first) !== this.plannedFor || Game.time >= this.planned + kPlanPace;
    }

    plan() {
        const first = _.first(this.list);
        if (!first) return this.seed();
        // Only with the target room in view: blind, its structures are open
        // ground, the plan runs straight through the walls and lists none
        // of them (a 16-step line through four walls in W18S5, Oct 2026).
        // The last plan stands until the next look.
        if (!this.room) return;
        const key = JSON.stringify(first);
        if (key === this.plannedFor && Game.time < this.planned + kPlanPace) return;

        const origin = this.origin();
        if (!origin) {
            debug.log(this.name, "no anchor and no spawn in home room", this.homeRoomName);
            return;
        }
        this.planned = Game.time;
        this.plannedFor = key;
        const added = this.breachTo(origin, fromXY(first[0], first[1]));
        if (added.length) debug.log(this.name, "breach adds", added.length, "tiles:", added.join(" "));
    }

    // Plan the breach from `origin` to beside `dest` (this.breach) and list
    // every tile on it something of somebody else's blocks; the tiles added.
    breachTo(origin: RoomPosition, dest: RoomPosition): RoomPosition[] {
        const mats: { [room: string]: CostMatrix | undefined } = {};
        // From inside the target room the breach stays in it: the open
        // ground of the neighbours would otherwise be a cheaper way round
        // the walls to the far side of the base (155 steps through W17S5
        // instead of through the wall, Oct 2026).
        const maxRooms = origin.roomName === dest.roomName ? 1 : kMaxRooms;
        const ret = PathFinder.search(origin, { pos: dest, range: 1 }, {
            plainCost: 1,
            swampCost: 1,
            maxOps: kMaxOps,
            maxRooms,
            roomCallback: name => {
                if (!(name in mats)) mats[name] = this.matrix(name);
                return mats[name] || new PathFinder.CostMatrix();
            },
        });
        this.breach = ret.path;
        if (ret.incomplete) debug.log(this.name, "breach plan incomplete: ops", ret.ops, "steps", ret.path.length);
        return _.filter(ret.path, pos => this.blocked(pos) && this.add(pos));
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

    // Winding down takes the flags with it: the anchor and its children
    // mean nothing without the mission, and Mission.kill drops the memory
    // that named them.
    windDown() {
        const flag = this.flag;
        if (flag) {
            for (const f of this.childFlags(flag)) f.remove();
            flag.remove();
        }
        super.windDown();
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        this.placeFlags();
        this.doFlags();
        this.prune();
        if (!this.room && this.planPending()) theRadar.observeNow(this.roomName);
        this.plan();
        this.draw();

        if (this.list.length) this.paceNJobs(Bulldozer, this.dozers);

        const role = Bulldozer.name.toLowerCase();
        if (this.hasEgg(role) || this.roleHatches(role).length) {
            this.getRoom("home")?.requestBoost(kDozerBoost);
        }

        super.run();
        return "normal";
    }

    status(): string {
        const first = _.first(this.list);
        const anchor = this.anchor;
        return super.status() + ` home:${this.homeRoomName} spawn:${this.spawnRoomName}` +
            ` flag:${this.mem.flag || "-"}${this.flag ? "" : "(missing)"} anchor:${anchor.x},${anchor.y}` +
            ` dozers:${this.dozers} targets:${this.list.length}` + (first ? ` first:${first[1]}:${first[0]}` : "");
    }
}
