import { EnergyReserve, RCL2Energy } from "constants";
import { JobRole } from "job.role";
import { kebabCase } from "lodash";
import { register } from "mycreep";


@register
export class Ctrl extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn| null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room) return [null, []];

        // Full size while the room has no storage (all energy is for the
        // controller anyway); small at RCL8 or while the storage is below
        // the reserve.
        let cap = room.energyCapacityAvailable;
        if (room.controller!.level > 7) {
            cap = RCL2Energy;
        } else if (room.storage && room.storage.store.energy < EnergyReserve) {
            cap = RCL2Energy;
        }

        return this.localSpawn(spawns, {
            boosts: [RESOURCE_CATALYZED_GHODIUM_ACID],
            ecap: cap
        });
    }
}