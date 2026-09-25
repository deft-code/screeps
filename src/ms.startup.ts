import { Mission, MissionMemory } from "mission";
import { register, Priority, Service } from "process";
import { Pioneer } from "job.pioneer";
import { Scout } from "job.scout";
import { Claimer } from "job.claimer";
import { Guard } from "job.guard";
import { Wolf } from "job.wolf";
import { Reserver } from "job.reserver";
import { whoami } from "Rewalker";
import { getSpots } from "spots";
import { getMetaManager } from "metastruct";
import { Meta_rroad } from "metaremote";
import { kSwampAverse, pathTraffic, FarTarget } from "metatraffic";
import { remoteSpawns } from "spawnold";
import { defaultRewalker, MemPath, Path, fromXY } from "Rewalker";
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
// Cost of a tile another meta already plans a road on: below kRoadPlainCost
// so the startup road rides planned roads instead of laying its own beside.
const kRoadPlannedRoadCost = 1;
// Ticks between "Once Paver <room>" schedules for the same road room.
const kPaverPace = 1500;
// One wolf per this many ticks while an invader core stands in the room
// (Farm.suppressInvaderCore).
const kCorePace = 1500;
// Reservers against a foreign reservation are paced per controller spot over
// a CLAIM lifetime (Farm.reserverRate).
const kReserverLife = CREEP_CLAIM_LIFE_TIME;

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
// while the mission room has at least two of our construction sites,
// whatever the mission is otherwise doing. The home
// room is args[2], else the room of the nearest spawn outside the mission
// room (spawnold remoteSpawns, the pioneers' pool).
//
// The path becomes traffic entries, one Meta_rroad (metaremote.ts) per room
// named rroad_<room>_startup, saved into the per-room meta memory; each
// room's MetaManager plans the roads (so they coalesce with its others) and
// ActiveStrat places the sites in the unowned rooms, ClaimedStrat in the home
// room. As for a remote: in the mission room from the border the path leaves
// by to each source and to the controller (all roads from level 0: pioneers
// upgrade it from the claim on), border to border in the rooms between, and from the home
// room's storage (its traffic origin) to the border. Every entry keeps the
// road's swamp aversion (kSwampAverse). A replan that changes the path
// replaces them in place; winding down removes them (removeRoad() does the
// same by hand), and each room's replan removes our sites on the tiles no
// longer planned. Any unowned room on the road with our sites in view gets a
// "Once Paver <room>" at most every kPaverPace ticks, as Remote does.
//
// An invader core in the mission room draws one Wolf (job.wolf.ts) per
// kCorePace ticks until it is gone (Farm.suppressInvaderCore). While GCL is
// full and someone else's reservation stands on the controller (the one an
// invader core leaves behind blocks our construction sites, so the road
// never starts), Reservers (job.reserver.ts) are paced against it the Farm
// way: one per controller spot per CLAIM lifetime, skipped while the
// reservers alive can already strip it and while armed hostiles are in the
// room. With GCL free the claimer handles it instead.
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
                this.reserve(room, controller);
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
        if (this.building()) this.drawRoad();

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

    // Someone else's reservation on the controller, or null.
    foreignReservation(controller: StructureController): ReservationDefinition | null {
        if (controller.owner) return null;
        const res = controller.reservation;
        if (!res || res.username === whoami()) return null;
        return res;
    }

    // Farm.reserve: strip a foreign reservation with reservers, unless the
    // ones alive suffice or armed hostiles hold the room.
    reserve(room: Room, controller: StructureController) {
        if (room.hostiles.length) return null;
        const res = this.foreignReservation(controller);
        if (!res) return null;
        // attackController strips 1 reservation tick per CLAIM part per tick.
        if (this.reservePower() >= res.ticksToEnd) return null;
        const nspots = getSpots(controller.pos).length || 1;
        return this.paceJobs(Reserver, Math.floor(kReserverLife / nspots));
    }

    // Remaining attack power of the mission's reservers (spawning ones
    // included): ticks to live times CLAIM parts, summed.
    reservePower(): number {
        const reservers = [...this.roleCreeps("reserver"), ...this.roleHatches("reserver")];
        return _.sum(reservers, r => {
            const c = r.c;
            if (!c) return 0;
            const ttl = c.ticksToLive ?? CREEP_CLAIM_LIFE_TIME;
            return ttl * c.getActiveBodyparts(CLAIM);
        });
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
        const base = rewalker.restrictedRoomCallback(controller.pos, [goal]);
        const ret = PathFinder.search(controller.pos, goal, {
            plainCost: kRoadPlainCost,
            swampCost: kRoadSwampCost,
            maxOps: kRoadMaxOps,
            maxRooms: kRoadMaxRooms,
            roomCallback: roomName => {
                const cm = base(roomName);
                if (cm === false) return false;
                return this.metaCosts(roomName, cm === true ? null : cm);
            },
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
        this.saveRoadMetas(ret.path, controller, spawn.room.name);
    }

    // The Rewalker matrix for a room with every meta's plan laid over it:
    // planned structures and standing spots impassable, planned roads cheap,
    // the room's traffic plan included. That plan holds this road's own
    // tiles too (our road metas hold only entries), so a replan keeps to the
    // road it laid unless a clearly better one appears. Without this the
    // road ran over the hub's planned extensions in the mission room and the
    // two plans churned sites on the shared tiles.
    metaCosts(roomName: string, base: CostMatrix | null): CostMatrix {
        const man = getMetaManager(roomName);
        if (!man.metas.length) return base || new PathFinder.CostMatrix();
        const metas = man.getMatrix();
        const cm = base ? base.clone() : new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const m = metas.get(x, y);
                if (!m) continue;
                if (m >= 0xFE) {
                    cm.set(x, y, 0xFF);
                } else if (cm.get(x, y) < 0xFE) {
                    cm.set(x, y, kRoadPlannedRoadCost);
                }
            }
        }
        return cm;
    }

    // One Meta_rroad per room holding the path's traffic entries (pathTraffic;
    // the path runs from the controller to the home room, whose entry starts
    // at its storage), saved into each room's meta memory and tracked in
    // memory.roadMetas. A room still on the road gets its meta replaced in
    // place, so its traffic plan is never empty in between (MetaManager would
    // drop it with its sites); a room the road left loses its meta. Every
    // entry searches with a swamp tile at kSwampAverse, as the road itself
    // was found (kRoadSwampCost).
    saveRoadMetas(path: RoomPosition[], controller: StructureController, home: string) {
        // Paved all the way: pioneers upgrade this controller from the claim
        // on (a remote's controller leg is swamp-only because nobody does).
        const far: FarTarget[] = [{ dest: controller.pos, range: 1, rcl: 0, swamp: 0 }];
        for (const src of controller.room.find(FIND_SOURCES)) {
            far.push({ dest: this.sourceSpot(src), range: 1, rcl: 0, swamp: 0 });
        }
        const old = this.smem.roadMetas || {};
        const tracked: { [room: string]: string[] } = {};
        for (const [roomName, entries] of pathTraffic(path, far, home, 0, 0)) {
            for (const e of entries) e.swampCost = kSwampAverse;
            const man = getMetaManager(roomName);
            const meta = Meta_rroad.make(man, this.roomName, kRoadLeg, entries);
            man.setMeta(meta);
            man.save();
            tracked[roomName] = [meta.name];
        }
        for (const roomName in old) {
            if (tracked[roomName]) continue;
            const man = getMetaManager(roomName);
            for (const name of old[roomName]) man.deleteMeta(name);
            man.save();
        }
        this.smem.roadMetas = tracked;
        debug.log(this.name, "road metas saved", JSON.stringify(tracked));
    }

    // Where a source's road ends: beside the standing spot of the meta that
    // mines it (asrc, bsrc, rsrc) when one is planned, else beside the source.
    sourceSpot(src: Source): RoomPosition {
        const man = getMetaManager(src.pos.roomName);
        const meta = _.find(man.metas, m => (m.targetid() as string) === src.id && !!m.myspot);
        return meta ? fromXY(meta.myspot, src.pos.roomName) : src.pos;
    }

    // Delete the tracked road metas. Each room's MetaManager then replans its
    // traffic, or drops it a tick later when nothing else is left, and removes
    // our road sites on the tiles no longer planned.
    removeRoadMetas() {
        const tracked = this.smem.roadMetas;
        if (!tracked) return;
        for (const roomName in tracked) {
            const man = getMetaManager(roomName);
            for (const name of tracked[roomName]) man.deleteMeta(name);
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

    // At least two of our construction sites in the mission room: the road
    // is going in, so draw it. False while the room is invisible.
    building(): boolean {
        return (this.room?.find(FIND_MY_CONSTRUCTION_SITES).length || 0) >= 2;
    }

    drawRoad() {
        const road = this.road;
        if (road) road.draw(kRoadStyle);
    }

    // Drop the plan (the metas stay until the replan replaces them) and plan
    // afresh at once while the controller is in view; otherwise the next
    // tick with GCL full does. Works in an owned room too, where run() no
    // longer plans, so a road laid before the claim can be redone around
    // the base plan.
    replanRoad() {
        const mem = this.smem;
        delete mem.road;
        delete mem.roadAt;
        delete mem.roadRooms;
        delete mem.roadIncomplete;
        const controller = this.room?.controller;
        if (controller) this.planRoad(controller);
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
        const res = ctrl && !ctrl.my ? this.foreignReservation(ctrl) : null;
        const reserved = res ? ` reserved:${res.username}/${res.ticksToEnd}` : "";
        return super.status() + ` rcl:${lvl === undefined ? "?" : lvl}/${kDoneRCL}${early}${gcl}${road}${metas}${core}${reserved}`;
    }
}
