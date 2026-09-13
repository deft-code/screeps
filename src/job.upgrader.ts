import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";

// Storage energy needed before the first upgrader; the count then scales
// linearly, one per kEnergyPer (150k = 1.5, 200k = 2; nCreeps takes fractions). Upgraders never spawn at RCL 8 or in a room without storage.
export const kEnergyPer = 100000;

// Port of role.upgrader.js (2017 flag-team era, team.ts upgrader()) to the
// 2022 mission/job system. A surplus sink: burns banked storage energy into
// the controller while the room is below RCL 8.
//
// Missions call nJobs(Upgrader, Upgrader.want(room)): 0 until the storage
// holds kEnergyPer energy, then energy / kEnergyPer.
//
// Spawns "local" with body 'upgrader' (spawnold.buildBody): WORK-heavy,
// sized from the room's energy. Priority -1: every other egg goes first.
@register
export class Upgrader extends JobRole {
    priority = -1;

    static want(room: Room | undefined | null): number {
        if (!room?.controller?.my) return 0;
        if (room.controller.level >= 8) return 0;
        const e = room.storage?.store.energy || 0;
        if (e < kEnergyPer) return 0;
        return e / kEnergyPer;
    }

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room) return [null, []];
        return this.localSpawn(spawns, {});
    }

    // Typed view of the legacy prototype mixins.
    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    // role.upgrader.js roleUpgrader, with taskRecharge (storage, links,
    // containers) instead of taskRechargeHarvest: the job only exists while
    // the storage is full of energy, so it never needs to mine.
    start(): Task2Ret {
        const c = this.cc;
        const what = c.taskTask();
        if (what) return "wait";

        if (c.store.energy) {
            c.goUpgradeController(c.room.controller);
            return "wait";
        }
        c.taskRecharge();
        return "wait";
    }

    // role.upgrader.js afterUpgrader
    after() {
        if (!this.c) return;
        const c = this.cc;
        c.idleNom();
        c.idleRecharge();
    }
}
