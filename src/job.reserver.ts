import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";

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

    get homeName(): string | null {
        return this.mission.getRoomName("home");
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
