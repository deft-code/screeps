import { Mission, MissionMemory } from "mission";
import { Farm } from "ms.farm";
import { register, Priority } from "process";
import { Scout } from "job.scout";
import { Reserver } from "job.reserver";
import { whoami } from "Rewalker";
import { getMetaManager } from "metastruct";
import { RemotePlanner } from "metaremote";
import * as debug from "debug";

// team.ts reserve(): a reserver every 225 ticks holds a room's reservation;
// slow to 450 once ours is above 450 ticks and stop above 1000.
const kReservePace = 225;
const kReservePaceSlow = 450;
const kReserveSlowAt = 450;
const kReserveStopAt = 1000;

interface RemoteMemory extends MissionMemory {
    // room -> names of the metas this mission planned there (metaremote.ts).
    // Present (possibly empty) once planning has been attempted.
    metas?: { [room: string]: string[] }
    planned?: number
}

// Port of team.ts teamRemote to the mission system, in phases.
// Phase 1: visibility (Scout) and a held reservation (Reserver), plus the
// Farm rule against invader cores (Wolf).
// Phase 2: plans metas for the remote (container per source, full roads from
// the home storage to each source, swamp-only roads to the controller) into the per-room
// meta memory, tracks and draws them. ActiveStrat builds them in the unowned
// rooms, ClaimedStrat in the home room.
// Phase 3 (todo): harvester/paver/trucker.
//
// Extends Farm so suppressInvaderCore is shared, but run() and reserve() are
// replaced: no farmers are laid, and the reservation is maintained rather than
// only contested.
//
// Schedule from the console:
//   scheduleService('Remote W5N8 W6N8')   // args[1]=remote room, args[2]=home room
// Retire with windDown(), not kill(): windDown removes the planned metas.
@register
export class Remote extends Farm {
    get memory(): RemoteMemory {
        return super.memory as RemoteMemory;
    }

    run(): Priority {
        if (this.windingDown) return Mission.prototype.run.call(this);

        if (!this.room) {
            // No visibility: a scout parks in the room until a reserver arrives.
            this.nJobs(Scout, 1);
        } else {
            // Both may lay an egg in the same tick.
            this.suppressInvaderCore();
            this.reserve();
            if (!this.memory.metas) this.planMetas();
        }
        this.drawMetas();
        // Farm.run() would lay farmers, so reach Mission.run() directly.
        Mission.prototype.run.call(this);
        return "normal";
    }

    // team.ts reserve() (line 693): keep the controller reserved for us. Farm
    // only lays reservers to undo a foreign (invader core) reservation; here
    // they are paced continuously. A foreign reservation needs no special
    // case: the Reserver job attacks it when reserveController is refused.
    reserve() {
        const room = this.room!;
        if (room.hostiles.length) return null;
        const controller = room.controller;
        if (!controller || controller.owner) return null;

        let pace = kReservePace;
        const res = controller.reservation;
        if (res && res.username === whoami()) {
            if (res.ticksToEnd > kReserveStopAt) return null;
            if (res.ticksToEnd > kReserveSlowAt) pace = kReservePaceSlow;
        }
        return this.paceJobs(Reserver, pace);
    }

    // Plan and save the metas for this remote. Needs vision of the remote
    // room and a storage (built or planned) in the home room. `force` removes
    // the current metas first; from the console:
    //   require('process').Service.getType('Remote W27S9 W26S8').planMetas(true)
    planMetas(force = false): boolean {
        const room = this.room;
        const home = this.getRoomName("home")!;
        if (!room) {
            debug.log(this.name, "planMetas: no vision of", this.roomName);
            return false;
        }
        if (this.memory.metas) {
            if (!force) return false;
            this.removeMetas();
        }
        const start = Game.cpu.getUsed();
        let planner: RemotePlanner;
        try {
            planner = new RemotePlanner(home, this.roomName);
        } catch (err) {
            debug.log(this.name, "planMetas:", err);
            // Record the attempt so we do not retry every tick; force replans.
            this.memory.metas = {};
            this.memory.planned = Game.time;
            return false;
        }
        for (const r of planner.sources(room.find(FIND_SOURCES))) {
            debug.log(this.name, "leg", r.leg, "steps", r.steps, "ops", r.ops, "incomplete", r.incomplete, "metas", r.metas.length);
        }
        if (room.controller) {
            const r = planner.controller(room.controller);
            debug.log(this.name, "leg", r.leg, "steps", r.steps, "ops", r.ops, "incomplete", r.incomplete, "metas", r.metas.length);
        }
        this.memory.metas = planner.saveAll();
        this.memory.planned = Game.time;
        debug.log(this.name, "planMetas used", Game.cpu.getUsed() - start, "cpu");
        return true;
    }

    // Draw every meta this mission planned, in every room, vision or not.
    drawMetas() {
        const tracked = this.memory.metas;
        if (!tracked) return;
        for (const roomName in tracked) {
            const man = getMetaManager(roomName);
            const v = new RoomVisual(roomName);
            for (const name of tracked[roomName]) {
                man.getMeta(name)?.draw(v);
            }
        }
    }

    // Delete the tracked metas from their rooms and drop our construction
    // sites on their tiles where we can see them. The rooms then evolve back
    // to NullStrat and whatever was built decays.
    removeMetas() {
        const tracked = this.memory.metas;
        if (!tracked) return;
        for (const roomName in tracked) {
            const man = getMetaManager(roomName);
            const room = Game.rooms[roomName];
            for (const name of tracked[roomName]) {
                const meta = man.getMeta(name);
                if (!meta) continue;
                if (room) {
                    for (const stype of [STRUCTURE_ROAD, STRUCTURE_CONTAINER] as BuildableStructureConstant[]) {
                        for (const pos of meta.getSites(stype).map(xy => room.unpackPos(xy))) {
                            for (const site of pos.lookFor(LOOK_CONSTRUCTION_SITES)) {
                                if (site.my && site.structureType === stype) site.remove();
                            }
                        }
                    }
                }
                man.deleteMeta(name);
            }
            man.save();
        }
        debug.log(this.name, "removed metas", JSON.stringify(tracked));
        delete this.memory.metas;
        delete this.memory.planned;
    }

    windDown() {
        super.windDown();
        this.removeMetas();
    }

    status(): string {
        const res = this.room?.controller?.reservation;
        const held = res ? ` reserved:${res.username}/${res.ticksToEnd}` : " reserved:-";
        const tracked = this.memory.metas;
        const metas = tracked ? ` metas:${_.sum(_.map(tracked, n => n.length))}@${_.keys(tracked).join(",")}` : " metas:unplanned";
        return super.status() + held + metas;
    }
}
