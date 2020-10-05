import { CreepHarvest } from "creep.harvest";
import { injecter } from "roomobj";
import { TaskRet } from "Tasker";
import { dist } from "routes";
import { RoomIntel, bestDeposit } from "intel";

@injecter(Creep)
export class RoleDepositFarmer extends CreepHarvest {
    roleDepositfarmer() {
        let what = this.taskTask();
        if (what) return what;

        let cooldown = RoomIntel.get(this.team.pos.roomName)?.depositCooldown || 0;

        const d = dist(this.home.name, this.team.pos.roomName);
        if (this.store.getFreeCapacity() === 0 || (this.store.getUsedCapacity() && this.ticksToLive < cooldown + 50 * d)) {
            return this.taskMoveRoom(this.home.controller!) || this.taskTransferResources();
        }

        if (!this.team.room) return this.moveRoom(this.team);

        const deposit = bestDeposit(this.team.room);
        this.log("role stuff", this.team, this.team.room, deposit);
        return this.taskHarvestDeposit(deposit);
    }

    taskHarvestDeposit(deposit: Deposit | null): TaskRet {
        if (!this.store.getFreeCapacity()) return false;

        deposit = this.checkId('harvestDeposit', deposit)
        if (!deposit) return false;

        if (deposit.cooldown) {
            if (this.store.getUsedCapacity()) {
                const d = dist(this.home.name, this.team.pos.roomName);
                if (this.ticksToLive < deposit.cooldown + 50 * d) {
                    this.log("Early Done Deposit", this.ticksToLive, deposit.cooldown, d);
                    return false;
                }
            }
            return this.moveNear(deposit) || "wait";
        }

        return this.goHarvest(deposit);
    }
}