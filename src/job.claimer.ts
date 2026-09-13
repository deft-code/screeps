import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";

// Port of role.claimer.js (2017 flag-team era) to the mission/job system.
// Spawns from the nearest spawns outside the mission room ("remote"), walks there and claims
// the controller. A controller owned by someone else is attacked instead,
// as the legacy role did. Once the controller is ours it idles out its
// 600-tick life; the Startup mission lays no more while the room is ours.
@register
export class Claimer extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // body key "claimer" in spawnold.buildBody: [MOVE, CLAIM].
        return this.remoteSpawn(spawns, { body: "claimer" });
    }

    start(): Task2Ret {
        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        const controller = this.c.room.controller;
        if (!controller) {
            this.log("no controller to claim in", this.mission.roomName);
            return "wait";
        }
        if (controller.my) return "wait";
        return this.claim(controller);
    }

    @task
    claim(controller: StructureController): Task2Ret {
        if (controller.pos.roomName !== this.pos.roomName) return "start";
        if (controller.my) return "start";
        const err = controller.owner
            ? this.c.attackController(controller)
            : this.c.claimController(controller);
        if (err === OK) return "wait";
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(controller, 1);
            return "wait";
        }
        this.log("claim failed", err, controller);
        return "wait";
    }
}
