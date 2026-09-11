import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";

// Port of role.farmer.js (2017 flag-team era) to the 2022 mission/job system.
// Spawns in the mission's "home" room, walks to the mission (farm) room,
// harvests until full, then walks home and deploys the energy there.
@register
export class Farmer extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const homeName = this.homeName;
        if (!homeName) return [null, []];
        const homeSpawns = spawns.filter(s => s.room.name === homeName);
        if (!homeSpawns.length) return [null, []];
        // body key "farmer" in spawnold.buildBody: 1 MOVE per [WORK, CARRY, CARRY], needs ecap >= 550
        return this.localSpawn(homeSpawns, { spawn: homeName, body: "farmer" });
    }

    get homeName(): string | null {
        return this.mission.getRoomName("home");
    }

    get farmName(): string {
        return this.mission.roomName;
    }

    get home(): Room | null {
        return this.mission.getRoom("home");
    }

    // Typed view of the legacy prototype mixins (CreepRepair is the top of the TS chain).
    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    at(roomName: string | null): boolean {
        return !!roomName && this.pos.roomName === roomName;
    }

    start(): Task2Ret {
        const c = this.cc;
        const what = c.idleRetreat(WORK) ||
            c.fleeHostiles() ||
            c.idleEmergencyUpgrade() ||
            c.taskTask();
        if (what) return "wait";

        if (this.at(this.homeName)) {
            if (c.store.getUsedCapacity()) {
                this.deploy();
                return "wait";
            }
            return this.moveRoom(this.farmName);
        }

        if (this.at(this.farmName)) {
            if (this.farm()) return "wait";
            return this.moveRoom(this.homeName!);
        }

        // In transit: full creeps head home, everything else heads to the farm.
        if (!c.store.getFreeCapacity()) {
            return this.moveRoom(this.homeName!);
        }
        return this.moveRoom(this.farmName);
    }

    // role.farmer.js taskFarm + role.collector.js taskCollect
    farm() {
        const c = this.cc;
        if (!c.store.getFreeCapacity()) return false;
        return c.taskPickupAny() ||
            c.taskWithdrawAny() ||
            c.taskHarvestSpots();
    }

    deploy() {
        const c = this.cc;
        return c.taskTransferResources() ||
            c.taskBuildOrdered() ||
            c.taskRepairOrdered() ||
            c.goUpgradeController(c.room.controller);
    }

    // role.farmer.js afterFarmer
    after() {
        if (!this.c) return;
        const c = this.cc;
        c.idleNom();
        c.idleBuild() || c.idleRepairAny() || c.idleUpgrade();
    }
}
