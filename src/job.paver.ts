import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";

// Port of role.paver.js to the mission/job system. Spawned by "Once Paver
// <room>" (ms.once.ts), which Remote schedules whenever an unclaimed room on
// its route has construction sites. Walks to the mission room, harvests there
// when empty, builds any of our sites, then repairs roads and containers.
@register
export class Paver extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // Body "farmer" is WORK/CARRY/CARRY per MOVE.
        return this.closeSpawn(spawns, { body: "farmer" });
    }

    // Typed view of the legacy prototype mixins.
    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    start(): Task2Ret {
        const c = this.cc;
        // role.bootstrap.js taskRechargeHarvest and creep.oldrepair.js
        // taskRepairRemote are JS mixins without typings.
        const legacy = c as any;
        const what = c.idleRetreat(WORK) || c.fleeHostiles() || c.taskTask();
        if (what) return "wait";

        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        if (!c.store.energy) {
            legacy.taskRechargeHarvest();
            return "wait";
        }
        c.taskBuildAny() || legacy.taskRepairRemote();
        return "wait";
    }

    after() {
        const c = this.cc;
        // Scoop energy dropped or left in tombstones/ruins within reach.
        c.idleNom();
        c.idleBuild() || c.idleRepairAny();
    }
}
