import { EnergyReserve, RCL2Energy } from "constants";
import { JobRole } from "job.role";
import { kebabCase } from "lodash";
import { register } from "mycreep";


@register
export class Ctrl extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn| null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room) return [null, []];

        let cap = room.energyCapacityAvailable;
        if (room.controller!.level > 7) {
            cap = RCL2Energy;
        } else if ((room.storage?.store.energy || 0) < EnergyReserve) {
            cap = RCL2Energy;
        }

        return this.localSpawn(spawns, {
            boosts: [RESOURCE_CATALYZED_GHODIUM_ACID],
            ecap: cap
        });
    }
}