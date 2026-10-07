import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { whoami } from "Rewalker";
import { getSpots } from "spots";

// team.ts reserve(): a reserver every kReservePace ticks holds a room's
// reservation for us; slow to kReservePaceSlow once ours is above
// kReserveSlowAt ticks and stop above kReserveStopAt. Reservers stand next
// to the controller, so never pace them faster than the free tiles around
// it can absorb: at least kReserveSpotPace / spots ticks apart. Shared by
// Remote (always) and Startup (while prebuilding a free room ahead of its
// claim).
const kReservePace = 225;
const kReservePaceSlow = 450;
const kReserveSlowAt = 450;
const kReserveStopAt = 1000;
const kReserveSpotPace = 500;

// Ticks between reservers to hold the room's reservation, or null for none
// now: armed hostiles in the room, no controller, someone owns it, or ours
// already runs past kReserveStopAt.
export function reserveHoldPace(room: Room): number | null {
    if (room.hostiles.length) return null;
    const controller = room.controller;
    if (!controller || controller.owner) return null;
    let pace = kReservePace;
    const res = controller.reservation;
    if (res && res.username === whoami()) {
        if (res.ticksToEnd > kReserveStopAt) return null;
        if (res.ticksToEnd > kReserveSlowAt) pace = kReservePaceSlow;
    }
    const nspots = getSpots(controller.pos).length || 1;
    return Math.max(pace, Math.floor(kReserveSpotPace / nspots));
}

// Port of role.reserver.js (2017 flag-team era) to the 2022 mission/job system.
// Spawns in the mission's "home" room, walks straight to the mission room's
// controller (to the room's center while the room is out of sight: intel
// keeps no controller position) and keeps it reserved. A controller reserved by someone else is attacked
// until the reservation drops. Farm paces one through Farm.reserve(), the
// team.ts reserve() rule from teamFarm.
@register
export class Reserver extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // body key "reserver" in spawnold.buildBody: 1 MOVE per CLAIM, needs >= 650 energy available.
        // Offroad creep: spawns fine from whatever spawns are nearest the mission room.
        return this.closeSpawn(spawns, { body: "reserver" });
    }

    start(): Task2Ret {
        const room = Game.rooms[this.mission.roomName];
        const controller = room?.controller;
        if (controller) return this.reserve(controller);
        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        this.log("no controller to reserve in", this.mission.roomName);
        return "wait";
    }

    // creep.work.js taskReserve
    @task
    reserve(controller: StructureController): Task2Ret {
        let err = this.c.reserveController(controller);
        if (err === ERR_INVALID_TARGET) {
            err = this.c.attackController(controller);
        }
        if (err === OK) return "wait";
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(controller, 1);
            return "wait";
        }
        this.log("reserve failed", err, controller);
        return "wait";
    }
}
