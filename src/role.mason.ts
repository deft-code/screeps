import { injecter } from "roomobj";
import { CreepRepair } from "creep.repair";

@injecter(Creep)
class RoleMason extends CreepRepair {
    roleMason() {
        let what = this.taskTask() || this.moveRoom(this.team) || this.taskNeedBoost();
        if (what) return what;

        if (this.store.energy) {
            return this.taskBuildOrdered() ||
                this.taskRepairOrdered() ||
                false;
        }
        return this.taskRecharge()
        //return this.taskRechargeHarvest()
    }

    afterWorker() {
        this.idleNom()
        this.idleRecharge()
        if (this.store.getUsedCapacity() > this.store.getFreeCapacity()) {
            this.idleBuild() || this.idleRepairAny();
        }
    }
}