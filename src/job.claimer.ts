import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { whoami } from "Rewalker";

// Port of role.claimer.js (2017 flag-team era) to the mission/job system.
// Spawns from the nearest spawns outside the mission room ("remote"), walks there and claims
// the controller. A controller owned or reserved by someone else is
// attacked instead (as the legacy role did for owners), then claimed once it
// is free. Once the controller is ours it idles out its 600-tick life; the
// Startup mission lays no more while the room is ours.
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
        if (!this.pos.isNearTo(controller)) {
            this.moveTarget(controller, 1);
            return "wait";
        }
        // A controller owned or reserved by someone else cannot be claimed
        // (or reserved: the engine rejects reserveController on a foreign
        // reservation). attackController is the only lever: it cuts an
        // owner's downgrade timer by 300 per CLAIM part, and a reservation by
        // 1 tick per CLAIM part on top of its own decay, so a foreign
        // reservation drains at 1 + nCLAIM per tick. The claim goes in the
        // tick it clears.
        const res = controller.reservation;
        const foreign = !!controller.owner || (!!res && res.username !== whoami());
        const err = foreign
            ? this.c.attackController(controller)
            : this.c.claimController(controller);
        if (err === OK) {
            if (foreign && Game.time % 50 === 0) {
                const who = controller.owner ? controller.owner.username : res!.username;
                const left = controller.owner ? controller.ticksToDowngrade : res!.ticksToEnd;
                this.log("attacking controller held by", who, "for", left, "ticks");
            }
            return "wait";
        }
        // ERR_TIRED: upgradeBlocked after our last attack; try again next tick.
        if (err === ERR_TIRED) return "wait";
        this.log("claim failed", err, controller);
        return "wait";
    }
}
