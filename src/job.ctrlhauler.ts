import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepCarry } from "creep.carry";
import type { Mission } from "mission";

// Storage energy the room must bank before a ctrlhauler is laid.
export const kStorageEnergy = 100000;
// Energy spent on the body: 2 CARRY per MOVE (spawnold 'hauler'), 1500 = 20 CARRY.
const kBodyEnergy = 1500;

// Storage -> ctrl container shuttle. The Meta_ctrl container under the ctrl
// creep is otherwise filled by whatever hauler passes; this job tops it up
// from storage while the room is rich.
//
// Missions call nJobs(CtrlHauler, CtrlHauler.want(mission)): 1 only while the
// storage holds kStorageEnergy energy, the ctrl container exists and holds
// no energy, and the mission's ctrl creep has none either; 0 otherwise. A
// living ctrlhauler keeps shuttling until it dies.
@register
export class CtrlHauler extends JobRole {
    // A surplus job like Upgrader: every other egg spawns first.
    priority = -1;

    static container(room: Room | null | undefined): StructureContainer | null {
        const spot = room?.meta.getSpot("ctrl");
        if (!spot) return null;
        return _.find(spot.lookFor(LOOK_STRUCTURES),
            s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer || null;
    }

    static want(mission: Mission): number {
        const room = mission.room;
        if (!room?.controller?.my) return 0;
        if ((room.storage?.store.energy || 0) < kStorageEnergy) return 0;
        const cont = CtrlHauler.container(room);
        if (!cont || cont.store.energy > 0) return 0;
        const ctrls = mission.roleCreeps("ctrl").filter(c => c.c);
        if (!ctrls.length || _.any(ctrls, c => c.c.store.energy > 0)) return 0;
        return 1;
    }

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room?.storage) return [null, []];
        return this.localSpawn(spawns, {
            body: "hauler",
            energy: Math.min(kBodyEnergy, room.energyCapacityAvailable / 2),
        });
    }

    get cc(): CreepCarry {
        return this.c as CreepCarry;
    }

    start(): Task2Ret {
        const c = this.cc;
        const room = this.mission.room;
        const storage = room?.storage;
        if (!storage) return "wait";

        if (!c.store.energy) {
            if (storage.store.energy) c.goWithdraw(storage, RESOURCE_ENERGY);
            return "wait";
        }
        const cont = CtrlHauler.container(room);
        if (!cont) {
            // Container gone (retired for the link): give the energy back.
            c.goTransfer(storage, RESOURCE_ENERGY);
            return "wait";
        }
        if (cont.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            c.goTransfer(cont, RESOURCE_ENERGY);
        } else if (!c.pos.isNearTo(cont)) {
            this.moveTarget(cont, 1);
        }
        return "wait";
    }

    after() {
        if (!this.c) return;
        this.cc.idleNom();
    }
}
