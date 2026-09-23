import { Mission, MissionMemory } from "mission";
import { register, Priority, Service } from "process";
import { Pioneer } from "job.pioneer";
import { Scout } from "job.scout";
import { Claimer } from "job.claimer";
import { Guard } from "job.guard";
import { Wolf } from "job.wolf";
import { getMetaManager } from "metastruct";
import { Meta_rroad } from "metaremote";
import { remoteSpawns } from "spawnold";
import { defaultRewalker, MemPath, Path, coordsToXY } from "Rewalker";
import * as debug from "debug";

// RCL at which the assisted room is on its own and the mission winds down.
const kDoneRCL = 4;
// Pioneers per creep lifetime below kDoneRCL, before and after the claim.
const kPioneers = 2;
// Ticks between "not ours" log lines while waiting for the room.
const kLogPace = 100;
// Ticks between road replans while GCL is full.
const kRoadPace = 500;
// PathFinder budget for the road plan.
const kRoadMaxOps = 20000;
const kRoadMaxRooms = 16;
// Tile costs for the road plan: a swamp road costs five times a plain one
// (CONSTRUCTION_COST_ROAD_SWAMP_RATIO), and existing roads are 1 in the
// Rewalker matrix, so the plan follows them where it can.
const kRoadPlainCost = 2;
const kRoadSwampCost = kRoadPlainCost * CONSTRUCTION_COST_ROAD_SWAMP_RATIO;

// Leg name of the road metas: rroad_<mission room>_startup in every room.
const kRoadLeg = "startup";
// Ticks between "Once Paver <room>" schedules for the same road room.
const kPaverPace = 1500;
// One wolf per this many ticks while an invader core stands in the room
// (Farm.suppressInvaderCore).
const kCorePace = 1500;

const kRoadStyle: PolyStyle = { stroke: "yellow", lineStyle: "dashed", strokeWidth: 0.15, opacity: 0.5 };

export interface StartupMemory extends MissionMemory {
    // Planned road, mission-room controller to the home spawn (Rewalker Path).
    road?: MemPath
    roadAt?: number
    roadRooms?: string[]
    roadIncomplete?: boolean
    // room -> names of the road metas planned there.
    roadMetas?: { [room: string]: string[] }
    // room -> tick a "Once Paver <room>" was last scheduled for it.
    pavers?: { [room: string]: number }
}

const rewalker = defaultRewalker();

// Boost a freshly claimed room with startup creeps spawned elsewhere.
//
//   scheduleService('Startup W5N8')        // args[1]=room to assist
//   scheduleService('Startup W5N8 W3N4')   // optional args[2]=home room the road leads to
//
// Without vision of the room one Scout (job.scout.ts) parks there. While the
// room's controller is not ours and GCL allows another room, one Claimer
// (job.claimer.ts) claims it. Meanwhile, if the room is free (no owner, no
// reservation) and has saved metas, the Pioneers go early: ActiveStrat
// (strat.ts) places the planned road and container sites in an unowned room
// and the pioneers harvest and build them. While it is ours and below RCL4,
// paces Pioneers (job.pioneer.ts) at kPioneers (2) per lifetime (paceNJobs),
// spawned by the nearest spawns outside the room ("remote" strategy) and
// homed on the room, plus nJobs(Guard, 1) until the room has a tower.
// At RCL4 the mission winds down: no more eggs, the
// living pioneers work until they die, then the mission kills and
// deschedules itself.
//
// While the controller is not ours and GCL has no room for another (owned
// rooms >= Game.gcl.level) no claimer is laid; instead the mission plans a
// road from the controller back to the home room: a PathFinder search from
// the controller to the home spawn through the Rewalker's room route and
// cost matrices, so keeper lairs, hostile structures and rooms the Rewalker
// rates hostile are avoided the way a walking creep avoids them. The plan
// is kept in memory (memory.road), redone every kRoadPace ticks, and drawn
// every tick it exists, whatever the mission is otherwise doing. The home
// room is args[2], else the room of the nearest spawn outside the mission
// room (spawnold remoteSpawns, the pioneers' pool).
//
// The planned tiles become road metas, one Meta_rroad (metaremote.ts) per
// room named rroad_<room>_startup, saved into the per-room meta memory so
// ActiveStrat places the sites in the unowned rooms and ClaimedStrat in the
// home room. A replan that changes the path replaces them; winding down
// removes them and our sites on their tiles (removeRoad() does the same by
// hand). Any unowned room on the road with our sites in view gets a "Once
// Paver <room>" at most every kPaverPace ticks, as Remote does.
//
// An invader core in the mission room draws one Wolf (job.wolf.ts) per
// kCorePace ticks until it is gone (Farm.suppressInvaderCore).
@register
export class Startup extends Mission {
    get roomName(): string {
        return this.args[1];
    }

    get smem(): StartupMemory {
        return this.memory as StartupMemory;
    }

    getRoomName(alias = ""): string | null {
        if (alias === "home") return this.homeName;
        return super.getRoomName(alias);
    }

    // args[2], else the room of the nearest spawn outside the mission room.
    get homeName(): string | null {
        if (this.args[2]) return this.args[2];
        const spawn = _.first(remoteSpawns(_.values<StructureSpawn>(Game.spawns), this.roomName));
        return spawn ? spawn.room.name : null;
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        const room = this.room;
        const controller = room?.controller;
        if (!room) {
            this.nJobs(Scout, 1);
        } else if (!controller) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: room has no controller");
        } else if (!controller.my) {
            this.suppressInvaderCore(room);
            if (this.gclFull) {
                this.planRoad(controller);
                this.schedulePavers();
            } else {
                this.claim();
            }
            if (this.canPioneerEarly(controller)) this.paceNJobs(Pioneer, kPioneers);
        } else if (controller.level >= kDoneRCL) {
            debug.log(this.name, "reached RCL", controller.level);
            this.windDown();
        } else {
            this.paceNJobs(Pioneer, kPioneers);
            if (!room.findStructs(STRUCTURE_TOWER).length) this.nJobs(Guard, 1);
        }
        this.drawRoad();

        super.run();
        return "normal";
    }

    // Pioneers ahead of the claim need sources they may harvest (nobody owns
    // or reserves the room) and something to build: only saved metas get
    // sites in an unowned room, and only roads and containers. Our own road
    // metas do not count: the road is the pavers' job.
    canPioneerEarly(controller: StructureController): boolean {
        if (controller.owner || controller.reservation) return false;
        const ours = this.smem.roadMetas?.[this.roomName] || [];
        return _.any(getMetaManager(this.roomName).metas, m => !_.contains(ours, m.name));
    }

    get ownedRooms(): number {
        return _.filter(Game.rooms, r => r.controller?.my).length;
    }

    // No GCL left for another controller.
    get gclFull(): boolean {
        return this.ownedRooms >= Game.gcl.level;
    }

    // One claimer alive at a time (nJobs with the CLAIM lifetime). A
    // controller someone else owns is attacked by the claimer, as
    // role.claimer.js did.
    claim() {
        return this.nJobs(Claimer, 1, CREEP_CLAIM_LIFE_TIME);
    }

    // One wolf per kCorePace ticks while an invader core stands in the room.
    suppressInvaderCore(room: Room) {
        if (!room.findStructs(STRUCTURE_INVADER_CORE).length) return null;
        return this.paceJobs(Wolf, kCorePace);
    }

    // Plan (every kRoadPace ticks) the road from the controller to the home
    // spawn with the Rewalker's route and matrices. A changed path replaces
    // the road metas; an unchanged one keeps them.
    planRoad(controller: StructureController) {
        const mem = this.smem;
        // A fresh plan waits out kRoadPace, unless it has no metas yet (a plan
        // made before the metas existed, or after removeRoad()).
        if (mem.road && mem.roadMetas && Game.time - (mem.roadAt || 0) < kRoadPace) return;
        const homeName = this.homeName;
        const home = homeName ? Game.rooms[homeName] : null;
        const spawn = home && _.first(home.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "GCL full; no home spawn to road to", homeName);
            return;
        }
        mem.roadAt = Game.time;
        const goal = { pos: spawn.pos, range: 1 };
        const ret = PathFinder.search(controller.pos, goal, {
            plainCost: kRoadPlainCost,
            swampCost: kRoadSwampCost,
            maxOps: kRoadMaxOps,
            maxRooms: kRoadMaxRooms,
            roomCallback: rewalker.restrictedRoomCallback(controller.pos, [goal]),
        });
        if (!ret.path.length) {
            debug.log(this.name, "road plan found nothing", controller.pos, "->", spawn.pos, "ops", ret.ops);
            return;
        }
        const path = new Path([controller.pos, ...ret.path]);
        const road = path.serialize();
        if (mem.road && _.isEqual(mem.road, road) && mem.roadMetas) return;
        mem.road = road;
        mem.roadRooms = _.uniq(ret.path.map(p => p.roomName));
        mem.roadIncomplete = ret.incomplete;
        debug.log(this.name, "road plan", ret.path.length, "tiles via", mem.roadRooms.join(">"),
            "cost", ret.cost, "ops", ret.ops, ret.incomplete ? "INCOMPLETE" : "");
        this.removeRoadMetas();
        this.saveRoadMetas(ret.path);
    }

    // One Meta_rroad per room from the planned tiles, exits left out, saved
    // into each room's meta memory and tracked in memory.roadMetas.
    saveRoadMetas(path: RoomPosition[]) {
        const byRoom = new Map<string, number[]>();
        for (const p of path) {
            if (p.x === 0 || p.y === 0 || p.x === 49 || p.y === 49) continue;
            let xys = byRoom.get(p.roomName);
            if (!xys) byRoom.set(p.roomName, xys = []);
            xys.push(coordsToXY(p.x, p.y));
        }
        const tracked: { [room: string]: string[] } = {};
        for (const [roomName, xys] of byRoom) {
            const man = getMetaManager(roomName);
            const meta = Meta_rroad.make(man, this.roomName, kRoadLeg, xys);
            man.setMeta(meta);
            man.save();
            tracked[roomName] = [meta.name];
        }
        this.smem.roadMetas = tracked;
        debug.log(this.name, "road metas saved", JSON.stringify(tracked));
    }

    // Delete the tracked road metas and our road sites on their tiles where
    // we can see them (Remote.removeMetas).
    removeRoadMetas() {
        const tracked = this.smem.roadMetas;
        if (!tracked) return;
        for (const roomName in tracked) {
            const man = getMetaManager(roomName);
            const room = Game.rooms[roomName];
            for (const name of tracked[roomName]) {
                const meta = man.getMeta(name);
                if (!meta) continue;
                if (room) {
                    for (const pos of meta.getSites(STRUCTURE_ROAD).map(xy => room.unpackPos(xy))) {
                        for (const site of pos.lookFor(LOOK_CONSTRUCTION_SITES)) {
                            if (site.my && site.structureType === STRUCTURE_ROAD) site.remove();
                        }
                    }
                }
                man.deleteMeta(name);
            }
            man.save();
        }
        debug.log(this.name, "removed road metas", JSON.stringify(tracked));
        delete this.smem.roadMetas;
    }

    // Any unowned room on the road with our construction sites in view gets a
    // "Once Paver <room>" (ms.once.ts), at most every kPaverPace ticks
    // (Remote.schedulePavers).
    schedulePavers() {
        const mem = this.smem;
        const tracked = mem.roadMetas;
        if (!tracked) return;
        const when = mem.pavers = mem.pavers || {};
        for (const roomName in tracked) {
            if (roomName === this.homeName) continue;
            const room = Game.rooms[roomName];
            if (!room || room.controller?.owner) continue;
            if (!room.find(FIND_MY_CONSTRUCTION_SITES).length) continue;
            const cmd = `Once Paver ${roomName}`;
            if (Service.getType(cmd)) continue;
            const last = when[roomName];
            if (last && last + kPaverPace > Game.time) continue;
            when[roomName] = Game.time;
            debug.log(this.name, "scheduling", cmd);
            Service.schedule(cmd);
        }
    }

    // Console: drop the road plan and its metas; the next tick with GCL full
    // plans afresh.
    removeRoad() {
        this.removeRoadMetas();
        this.replanRoad();
    }

    windDown() {
        super.windDown();
        this.removeRoadMetas();
    }

    get road(): Path | null {
        const mem = this.smem.road;
        return mem ? Path.deserialize(mem) : null;
    }

    drawRoad() {
        const road = this.road;
        if (road) road.draw(kRoadStyle);
    }

    // Drop the plan (the metas stay until the replan replaces them); the
    // next tick with GCL full plans afresh.
    replanRoad() {
        const mem = this.smem;
        delete mem.road;
        delete mem.roadAt;
        delete mem.roadRooms;
        delete mem.roadIncomplete;
    }

    status(): string {
        const ctrl = this.room?.controller;
        const lvl = ctrl?.level;
        const early = ctrl && !ctrl.my && this.canPioneerEarly(ctrl) ? " early" : "";
        const gcl = ctrl && !ctrl.my ? ` gcl:${this.ownedRooms}/${Game.gcl.level}` : "";
        const mem = this.smem;
        const road = mem.road
            ? ` road:${mem.road[2].length}${mem.roadIncomplete ? "!" : ""} via:${(mem.roadRooms || []).join(">")} home:${this.homeName}`
            : "";
        const metas = mem.roadMetas ? ` metas:${_.keys(mem.roadMetas).length}` : "";
        const core = ctrl && !ctrl.my && this.room!.findStructs(STRUCTURE_INVADER_CORE).length ? " core!" : "";
        return super.status() + ` rcl:${lvl === undefined ? "?" : lvl}/${kDoneRCL}${early}${gcl}${road}${metas}${core}`;
    }
}
